# ETL: `isis-db2` → Postgres

How InSIS data gets from the university's Oracle copy into the project's Postgres, which the MCP server reads.

> **Status: not implemented.** This file describes the intended behaviour so every step can be built and reviewed on
> its own. Decisions and their reasons: [planning/infra/etl.md](../planning/infra/etl.md). Points marked
> **(proposed)** are implementation suggestions, to be confirmed when the step is built. Open questions:
> [TODO.md](../TODO.md).

## Contents

1. [Where the ETL sits](#1-where-the-etl-sits)
2. [The source: isis-db2](#2-the-source-isis-db2)
3. [What one run does](#3-what-one-run-does)
4. [Postgres layout](#4-postgres-layout)
5. [The SQL files](#5-the-sql-files)
6. [From Oracle to Postgres types](#6-from-oracle-to-postgres-types)
7. [When it runs](#7-when-it-runs)
8. [When something fails](#8-when-something-fails)
9. [Schema changes and versions](#9-schema-changes-and-versions)
10. [Data age](#10-data-age)
11. [Commands and configuration](#11-commands-and-configuration)
12. [Local development](#12-local-development)
13. [Implementation steps](#13-implementation-steps)

## 1. Where the ETL sits

```
 isis-db2 (Oracle, VŠE)          VM                                          AI clients
 ┌──────────────────┐   nightly  ┌─────────┐   COPY   ┌──────────────────┐   ┌────────────┐
 │ views, read-only │ ─────────► │   ETL   │ ───────► │ Postgres         │ ◄─│ MCP server │ ◄── HTTPS
 │ refreshed nightly│   SELECT   │ one-shot│          │ raw, model, meta │   └────────────┘
 └──────────────────┘            └─────────┘          └──────────────────┘
```

- The ETL is the **only** component that talks to Oracle. The MCP server never does (too slow, too heavy, and it
  would need the Oracle credentials).
- It is a **one-shot** program: it starts, builds a complete new snapshot of the data, swaps it in and exits. Nothing
  runs between runs.
- Each environment (`prod`, `dev`) has its own ETL run and its own database. Dev runs the ETL code from `develop`, so
  changes to the SQL are tested on real data before they reach production.

## 2. The source: isis-db2

| Fact                        | Consequence                                                                          |
|-----------------------------|--------------------------------------------------------------------------------------|
| Oracle copy of InSIS production, 6000+ tables | We never copy the database; we run a **curated set of queries** (extracts) |
| Refreshed nightly by VŠE (~07:00, exact time unknown) | One ETL run per night, after the refresh                    |
| Read-only account, access through views | No change log, no CDC → every run is a **full rebuild**, never incremental |
| Reachable only from the VM  | No ETL from a laptop or from CI; local work uses a dump of the dev database (§12)   |
| Not owned by this project   | Views may change without notice → every run checks what it loaded (§3, steps 5 and 7) |

The extract queries come from the thesis advisor (InSIS admin). Person/teacher data is limited to what the public
InSIS interface shows; this is enforced by what the extracts select, so the Postgres data is public-tier by design.

## 3. What one run does

A run builds the new snapshot next to the live one and only replaces the live one when everything succeeded.
Readers never see half-loaded data.

| # | Step | What happens | If it fails |
|---|------|--------------|-------------|
| 0 | **Lock** | Only one run per environment at a time (`flock`, taken by the wrapper script that starts the container). | Waits, then gives up. |
| 1 | **Start bookkeeping** | Create `meta` objects if missing. Mark runs left as `running` by a killed process as `failed`. Insert a new `meta.etl_run` row (`running`). | Run aborts; nothing else touched. |
| 2 | **Prepare staging** | Drop leftovers of an earlier failed run, create empty `raw_next` and `model_next`. | Run fails; live data untouched. |
| 3 | **Extract** | For each extract in the manifest: run the Oracle query and stream the rows (batches of ~1000, never the whole result in memory). | Run fails; live data untouched. |
| 4 | **Load raw** | Create `raw_next.<extract>` with the query's columns (§6) and stream the rows in with `COPY … FROM STDIN`. Count rows. | Run fails; live data untouched. |
| 5 | **Check extracts** | Each extract has at least `minRows` rows (guards against a silently empty view) and its `key` columns are unique. | Run fails with the list of problems. |
| 6 | **Build model** | Run `sql/model/*.sql` (create tables) then `sql/transform/*.sql` (fill them from raw) into `model_next`. | Run fails with the file name and the SQL error. |
| 7 | **Check model** | Run `sql/check/*.sql`; each must return **no rows**. Constraints in the model DDL (keys, foreign keys, `not null`) are checked by Postgres while transforming. | Run fails with the failing check. |
| 8 | **Grant** | Give the MCP server's read-only role `usage` + `select` on `model_next` (grants survive the rename in step 9). | Run fails; live data untouched. |
| 9 | **Swap** | In **one transaction**: drop `*_prev`, rename live → `*_prev`, rename `*_next` → live, point `meta.live` at this run, mark it `succeeded`. | Transaction rolls back; live data untouched. |
| 10 | **Exit** | Exit code 0. Old `*_prev` from the run before is gone, so the database holds at most three snapshots for a moment and two afterwards. | — |

Any failure: the run's `meta.etl_run` row becomes `failed` with the error text, the process exits ≠ 0, and the
systemd unit reports it to Discord (§8). The live snapshot stays exactly as it was.

**(proposed)** Open the Oracle connection only when the first extract runs. With an empty manifest, the whole pipeline
(empty snapshot, swap, data age) can then run without `isis-db2`, so environments work before the first extract
exists.

## 4. Postgres layout

One database per environment (`insis_prod`, `insis_dev`), owned by the ETL's role. The MCP server's role can only
read.

| Schema | Content | Written by | Read by |
|--------|---------|------------|---------|
| `raw` | One table per extract, columns exactly as the query returned them, no logic. | ETL | ETL (transforms) |
| `model` | Normalized, project-owned tables (courses, study plans, timetable, public teacher info, …). | ETL | **MCP server** |
| `meta` | Run history and which snapshot is live. Not swapped; grows by one row per run. | ETL | MCP server, operators |
| `raw_next`, `model_next` | The snapshot being built. Exists only during a run (or after a failed one). | ETL | — |
| `raw_prev`, `model_prev` | The previous snapshot, kept for instant rollback. | ETL | — |

Why two layers: `raw` mirrors InSIS, `model` is ours. When the advisor changes or adds a query, only the extract and
its transform change; the MCP server keeps reading the same `model`.

`meta` tables **(proposed)**:

| Table | Columns | Meaning |
|-------|---------|---------|
| `meta.etl_run` | `id`, `started_at`, `finished_at`, `status` (`running` / `succeeded` / `failed`), `trigger` (`timer` / `deploy` / `manual`), `schema_version`, `row_counts` (json: extract → rows), `error` | One row per run |
| `meta.live` | `run_id`, `swapped_at` (single row) | Which run's snapshot is in `raw`/`model` |
| `meta.previous` | `run_id` (single row) | Which run's snapshot is in `raw_prev`/`model_prev` |

## 5. The SQL files

Adding data means adding SQL files, not code. **(proposed)** layout inside `etl/sql/`:

| Path | Runs against | Content |
|------|--------------|---------|
| `extract/manifest.json` | — | List of extracts |
| `extract/<name>.sql` | Oracle | One query per extract; its result becomes `raw.<name>` |
| `model/NN-<name>.sql` | Postgres | DDL of the `model` tables |
| `transform/NN-<name>.sql` | Postgres | `insert … select` from raw into model |
| `check/NN-<name>.sql` | Postgres | Queries that must return no rows |

Files run in file-name order; prefix them `10-`, `20-`, … to control it.

Manifest entry:

```json
{ "name": "course", "file": "course.sql", "key": ["course_id"], "minRows": 1 }
```

- `name`: raw table name, a lower-case SQL identifier.
- `key`: columns that must be unique in the result (optional).
- `minRows`: fewer rows fail the run (default 1).

Schema placeholders: Postgres files never name schemas directly; they write `{{raw}}` and `{{model}}`, which the ETL
replaces with the staging schemas. The same file therefore always builds into the snapshot under construction:

```sql
-- transform/10-course.sql
insert into {{model}}.course (id, code, title)
select course_id::integer, code, title
from {{raw}}.course;
```

```sql
-- check/10-course-has-title.sql: every course needs a title
select id from {{model}}.course where title is null or title = '';
```

Column names come from the Oracle query; alias anything that is not a plain identifier (`select count(*) as n`).

If the advisor's queries may not be published (open question in TODO.md), `etl/sql/extract/` stays out of the repo
and is mounted into the container instead (`ETL_SQL_DIR`).

## 6. From Oracle to Postgres types

Raw tables get their column types from the query result. **(proposed)** mapping:

| Oracle | Postgres (`raw`) | Note |
|--------|------------------|------|
| `NUMBER`, `BINARY_INTEGER` | `numeric` | Fetched as text to keep full precision |
| `BINARY_FLOAT`, `BINARY_DOUBLE` | `double precision` | |
| `DATE`, `TIMESTAMP` | `timestamp` | Wall-clock time, no zone (see below) |
| `TIMESTAMP WITH (LOCAL) TIME ZONE` | `timestamptz` | |
| `VARCHAR2`, `CHAR`, `NVARCHAR2`, `CLOB`, … | `text` | CLOBs fetched inline |
| `RAW`, `BLOB` | `bytea` | |

Oracle `DATE` has no time zone, and the driver interprets it in the process's zone. The ETL container therefore runs
with `TZ=UTC`, which keeps the original wall-clock value intact on its way into a `timestamp` column. Transforms cast
raw types into proper model types (`numeric` → `integer`, etc.).

## 7. When it runs

| Trigger | When | Notes |
|---------|------|-------|
| systemd timer | prod **07:30**, dev **08:00** (Europe/Prague) | Placeholders until the refresh time is known (TODO.md). Staggered so the two runs never load Oracle and Postgres at the same time. `Persistent=true` catches a run missed during a reboot. |
| Deploy | When the deployed ETL image differs from the last good one | Runs **before** the new MCP server starts, so new code finds the new model (§9). Failure aborts the deploy. |
| Manual | `systemctl start insis-etl@<env>.service` | After fixing a failure. |

No freshness probe: the ETL loads whatever `isis-db2` contains at that moment.

## 8. When something fails

- The live snapshot always stays untouched (§3).
- No automatic retry: retrying would hide real problems such as a changed view in InSIS.
- The systemd unit's `OnFailure=` posts the unit name and the last log lines to Discord (`#alerts` for prod,
  `#alerts-dev` for dev). This path does not depend on the monitoring stack.
- Monitoring additionally alerts when the data is older than 36 hours, which also catches an ETL that silently stopped
  running.
- Fix, then rerun manually. To go back to yesterday's data in the meantime: `rollback` (§11).

## 9. Schema changes and versions

The MCP server's queries depend on the `model` tables, so code and data must match.

- `SCHEMA_VERSION` lives in `packages/db` and is bumped with every `model` change. The ETL records it on each run; the
  MCP server reports unhealthy if the live snapshot was built for another version, and a deploy with an unhealthy
  server rolls back.
- **Additive changes only**: add tables and columns; drop them one release later. An older MCP server then still
  works on a newer snapshot, which makes rollbacks safe.
- Deploy order when the ETL changed: run the new ETL → swap → start the new MCP server.

## 10. Data age

Data is at most about a day old. The time of the live snapshot (`finished_at` of the run in `meta.live`) is exposed:

1. `/health` of the MCP server: `dataAsOf`, `ageHours`.
2. Tool results: `_meta.dataAsOf` (structured metadata, normally not shown to the model).
3. One line in the server's `instructions`: "Data snapshot from InSIS as of …".

## 11. Commands and configuration

**(proposed)** CLI (container entrypoint `node dist/index.js <command>`):

| Command | Does |
|---------|------|
| `run` | One full run (§3) |
| `rollback` | Swap live and previous snapshot in one transaction; running it again restores the original state |
| `status` | Latest runs, which one is live and which is previous |

Environment:

| Variable | Meaning |
|----------|---------|
| `DATABASE_URL` | Postgres connection as the ETL role of this environment |
| `READER_ROLE` | Role of the MCP server; gets read access to each new snapshot |
| `ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_CONNECT_STRING` | `isis-db2` (only the ETL container gets these) |
| `ETL_SQL_DIR` | SQL directory, default `sql/` next to the program |
| `ETL_TRIGGER` | `timer` / `deploy` / `manual`, recorded in `meta.etl_run` |

Logs: one JSON object per line on stdout (collected by journald and Loki).

## 12. Local development

`isis-db2` is unreachable from a laptop, so:

- Postgres logic (load, transforms, checks, swap) is tested against a local Postgres with a **fake source** that
  returns fixed rows. Tests use hand-written synthetic data only; the repository is public.
- For real data, a dump of the dev database's `model` schema (never `raw`) is streamed over SSH into `.local/`
  (gitignored). Whether the NDA allows this is an open question in TODO.md.
- Oracle-specific code (driver, type mapping) can only be tried on the VM, in the dev environment.

## 13. Implementation steps

Each step is small enough to build, test and review on its own.

- [ ] Shared contract in `packages/db`: `SCHEMA_VERSION`, schema names, `meta` DDL and types
- [ ] SQL plan: manifest parsing and validation, reading model/transform/check files, placeholders
- [ ] Load: raw table creation from result columns, `COPY` encoding, row counting (tests with a fake source)
- [ ] Build and checks: extract checks, model files, check files
- [ ] Swap and rollback, `meta` bookkeeping (tests against Postgres)
- [ ] Oracle source with node-oracledb Thin mode and the type mapping (needs the Oracle version, TODO.md)
- [ ] CLI (`run`, `rollback`, `status`) and configuration
- [ ] Container image
- [ ] First real extracts from the advisor's queries, with model, transforms and checks
- [ ] Host integration: lock wrapper, systemd timer, failure notification (with the deploy setup)
