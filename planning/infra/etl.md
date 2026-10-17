# ETL: `isis-db2` → Postgres

## Source

- `isis-db2`: Oracle copy of InSIS production, refreshed nightly by VŠE, read-only, accessed through views, 6000+
  tables. Not owned by this project.
- Reachable **only from the VM**. Not from a laptop, not from CI.
- The MCP server must not query it directly (too slow, too resource heavy).

## Scope: curated extracts, not a database copy

The ETL runs a **curated set of SQL extracts** prepared with the thesis advisor (InSIS admin), not a mirror of the
source. New data = new extract file, not new code.

- Each extract = one `.sql` file + manifest entry (target raw table, key columns, expected minimum row count).
- Person/teacher data: only what the InSIS public interface shows. This makes the `model` layer safe by design (see
  [Local data](#local-data)).

## Postgres layers

| Schema  | Content                                                                                          | Read by       |
|---------|--------------------------------------------------------------------------------------------------|---------------|
| `raw`   | One table per extract, columns 1:1 with query output, no logic                                   | ETL only      |
| `model` | Normalized, project-owned tables (courses, study plans, timetable, public teacher info, …) built from `raw` by SQL transforms in Postgres | MCP server    |
| `meta`  | `etl_run` (started/finished, status, per-extract row counts, snapshot date), `schema_version`    | MCP, monitoring |

**Why two layers**: decouples InSIS's shape from the MCP server's. A new or changed advisor query touches the extract
and its transform; MCP code is unaffected.

## Run: full nightly rebuild with atomic swap

1. Extract each query from Oracle, stream into `raw` tables of a fresh staging schema (`COPY FROM STDIN`).
2. Run transforms → staging `model` tables.
3. Validate: row counts vs manifest minimums, FK/uniqueness checks.
4. Atomic swap in one transaction: staging → live, live → `previous`. Older snapshots dropped.
5. Write `meta.etl_run`.

**Why full rebuild, not incremental/CDC**: the source itself is rebuilt nightly, has no change log, and a read-only
view account cannot run CDC (LogMiner/Debezium). The curated subset is small, so a full reload is cheap.

Properties:

- **Idempotent**: rerun = rebuild from scratch.
- **Never half-loaded**: any failure before the swap leaves the previous snapshot live.
- **Rollback**: `previous` schema can be swapped back instantly.

## Runtime form

- Separate TypeScript app (`etl/`, Node 24), own image, **one-shot container**:
  `docker compose -p insis-<env> run --rm etl`.
- Oracle driver: **`node-oracledb` Thin mode** (pure JS, no Instant Client). Requires Oracle DB ≥ 12.1 (to verify).
- Postgres: `pg` + `COPY FROM STDIN` streaming (fast, low memory).
- Bundled by tsup → runtime image contains only Node + `dist/`.
- Oracle credentials exist only in the ETL container's environment; the MCP server never sees them.

Rejected alternatives:

| Option                                  | Why not                                                                         |
|-----------------------------------------|---------------------------------------------------------------------------------|
| Long-lived container with internal cron | Idles RAM 24/7; missed runs lost on reboot                                      |
| Inside the MCP server process           | Couples ETL memory spikes and Oracle creds to the public-facing process         |
| `oracle_fdw` + `pg_cron`                | Custom Postgres image with Instant Client; Postgres holds Oracle creds; hard to test |

## Schedule

- systemd timers on the host: `insis-etl@prod.timer` **07:30**, `insis-etl@dev.timer` **08:00** Europe/Prague
  (staggered: no parallel Oracle/Postgres load). `Persistent=true` catches runs missed during a reboot.
- 07:30 is a placeholder until the real refresh time is known (see [TODO.md](../../TODO.md)).
- No freshness probe: the ETL loads whatever is there.
- `flock` per environment: a deploy-triggered run and a timer run never overlap.

## Failure handling

- Any error (Oracle down, query fails, validation fails) → exit ≠ 0, previous snapshot stays live.
- No automatic retry. Silent retries would hide schema changes on the InSIS side.
- systemd `OnFailure=` → Discord webhook with unit name and last journal lines (independent of the monitoring stack).
- Manual rerun after a fix: `systemctl start insis-etl@<env>.service`.

## Schema vs code versions

Problem: a new MCP image can expect model changes that only the next nightly ETL would create.

- `deploy.sh` runs the ETL **before** switching MCP whenever the `etl` image changed. ETL failure aborts the deploy.
- **Additive-change rule** for `model`: add tables/columns; drop only in a later release. Old MCP never breaks on a new
  schema, so rollback after an ETL run is safe.
- `SCHEMA_VERSION` constant in `packages/db` (shared by ETL and MCP). ETL writes it to `meta.schema_version`; the MCP
  health check fails on mismatch → deploy rolls back.

## Data age

Data served is at most ~1 day old. Exposed, from cheapest to most visible:

1. `/health` JSON: `dataAsOf`, `ageHours`. Monitoring alerts when age > 36 h (catches an ETL that silently stopped
   running, not just one that failed).
2. Tool results `_meta.dataAsOf` (structured metadata, normally not fed to the model).
3. One line in server `instructions`: snapshot date and that data may lag up to a day.

No per-row timestamps in tool output (token cost).

## Local data

Oracle is unreachable from a laptop, so local development uses a dump of the dev database.

- `scripts/pull-dev-dump.sh`: `ssh` → `docker exec` → `pg_dump` of the **`model` schema only** (never `raw`), streamed
  straight to the laptop into `.local/` (gitignored). Nothing is written to the VM disk.
- No separate sanitizer: `model` holds only public-tier data by design.
- Never committed, never in CI artifacts. CI and tests use hand-written synthetic fixtures (the repo is public).
- Local Postgres from root `compose.yaml`.
