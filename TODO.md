# TODO

## Ask the advisor

- [ ] What time does the nightly `isis-db2` refresh finish? ETL timers are set to 07:30 (prod) / 08:00 (dev) as
      placeholders — fix them once known.
- [ ] Oracle version of `isis-db2` (`node-oracledb` Thin mode needs ≥ 12.1).
- [ ] May the extract SQL queries (InSIS internal view/table names) be published in the public repo?
- [ ] Does the NDA allow keeping a local copy of the extracted data (dev dump on the laptop)?
- [ ] Is integration with VŠE's Zabbix expected in addition to Prometheus/Grafana?

## Setup

- [x] DNS for `bpmcp.vse.cz` (dev) points at the VM; the VM is reachable from the internet on 22, 80 and 443.
- [ ] DNS for `mcp.vse.cz` (prod), when production goes live.
- [ ] Bootstrap and harden the VM: [deploy/BOOTSTRAP.md](deploy/BOOTSTRAP.md) (old Traefik container already removed).

## Implementation

Step by step, one branch each. Design: [planning/infra/](planning/infra/README.md).

- [ ] ETL — steps in [etl/README.md § 13](etl/README.md#13-implementation-steps)
- [ ] MCP server: stateless Streamable HTTP endpoint and `/health` (data age, schema version)
- [ ] MCP server: `/metrics` with aggregate usage metrics
- [ ] MCP server: tools (design still open)
- [ ] Container images for `mcp` and `etl`
- [ ] Local development: Postgres in `compose.yaml`, dev data dump script
- [x] Deploy: platform stack (Traefik with Let's Encrypt on 443, Postgres), app stack skeleton, monitoring stack, env
      examples, hardening runbook
- [ ] Deploy: remaining steps in [deploy/README.md](deploy/README.md#todo) (deploy script, ETL timers, roles, host
      scripts, dashboards, bootstrap runbook)
- [x] CI: workspace and deploy config checks; deploy and GHCR cleanup workflows (manual trigger only)
- [ ] CI: enable push-triggered deploys and the cleanup schedule (TODOs in `.github/workflows/`)
