# InSIS MCP Server

A remote MCP server that gives AI clients access to academic data from **InSIS**, the information system of the
Prague University of Economics and Business (VŠE) — courses, study plans, timetables and similar data students
otherwise look up by hand.

It is the practical part of the author's **bachelor's thesis** at the Faculty of Informatics and Statistics (FIS VŠE).
The repository is public.

## Language

Infrastructure terms, agreed in [planning/infra/](../planning/infra/README.md). Domain terms (courses, study plans, …)
are added as they are agreed.

### Data

| Term               | Meaning                                                                                                   |
|--------------------|-----------------------------------------------------------------------------------------------------------|
| **`isis-db2`**     | Read-only Oracle copy of InSIS production, refreshed nightly by VŠE. The only data source. Reachable only from the VM. Never queried by the MCP server. |
| **ETL**            | Nightly one-shot job that runs the extracts, loads `raw`, builds `model`, validates and swaps.            |
| **Extract**        | One curated SQL query against `isis-db2` (`.sql` file + manifest entry), prepared with the thesis advisor. |
| **Raw layer**      | Postgres schema `raw`: one table per extract, columns 1:1 with query output, no logic. ETL-only.          |
| **Model layer**    | Postgres schema `model`: normalized, project-owned tables built from `raw`. The only data the MCP server reads. Public-tier data only. |
| **Snapshot**       | One complete ETL result. Exactly one is live; the one before it is kept as `previous`.                    |
| **Swap**           | Atomic switch of a validated staging snapshot to live. Failures before the swap leave the live snapshot untouched. |
| **Data age** / `dataAsOf` | Date of the live snapshot; exposed by `/health`, tool `_meta` and server `instructions`.           |
| **Schema version** | `SCHEMA_VERSION` in `packages/db`; ETL writes it to `meta`, the MCP server checks it on health.           |
| **Additive-change rule** | `model` changes only add tables/columns; drops happen a release later.                              |

### Operations

| Term               | Meaning                                                                                                   |
|--------------------|-----------------------------------------------------------------------------------------------------------|
| **Environment**    | `dev` (`bpmcp.vse.cz`, from `develop`) or `prod` (`mcp.vse.cz`, from `main`; not live yet). Same VM, own database, MCP container and ETL run. |
| **Edge**           | Traefik on the VM, directly on the internet: HTTPS on 443 with Let's Encrypt, port 80 only redirects. No proxy in front. |
| **Stack**          | A compose project on the VM: `platform`, `monitoring`, `insis-prod`, `insis-dev`.                         |
| **Deploy bundle**  | The repo's `deploy/` directory at a given commit, fetched by the deploy script into `/srv/insis-mcp/`.    |
| **Image key**      | Subtree hash of an image's build inputs; tag `tree-<hash>`. Equal key → retag, no rebuild.               |
| **`last-good`**    | Last deploy that passed the health check, in `/var/lib/insis-mcp/<env>/`; target of automatic rollback.   |
| **Usage metrics**  | Aggregate, non-identifying counters (tool calls, latency, response size/tokens, `client_name`). No IPs, users, sessions or argument values. |

## Flagged ambiguities

- Hostnames are `bpmcp.vse.cz` (dev) and `mcp.vse.cz` (prod, later). Any `insis.cz` name was a mistake.
