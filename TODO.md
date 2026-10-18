# TODO

## Ask the advisor

- [ ] What time does the nightly `isis-db2` refresh finish? ETL timers are set to 07:30 (prod) / 08:00 (dev) as
      placeholders — fix them once known.
- [ ] Oracle version of `isis-db2` (`node-oracledb` Thin mode needs ≥ 12.1).
- [ ] Upstream proxy in VŠE infra: how is forwarding to the VM done?
    - [ ] Is port `8080` OK for forwarding?
    - [ ] Is TLS terminated upstream?
    - [ ] Are both `mcp.insis.cz` and `bpmcp.insis.cz` forwarded?
    - [ ] No response buffering for SSE (Streamable HTTP) and a long idle timeout?
    - [ ] Are `X-Forwarded-For` / `X-Forwarded-Proto` passed?
    - [ ] Source IP of the proxy (for the firewall and Traefik trusted IPs)?
- [ ] May the extract SQL queries (InSIS internal view/table names) be published in the public repo?
- [ ] Does the NDA allow keeping a local copy of the extracted data (dev dump on the laptop)?
- [ ] Is integration with VŠE's Zabbix expected in addition to Prometheus/Grafana?

## Setup

- [ ] DNS for `mcp.insis.cz` and `bpmcp.insis.cz`.
- [ ] Check what the existing Docker containers/networks on the VM are before bootstrap.

## Implementation

Step by step, one branch each. Design: [planning/infra/](planning/infra/README.md).

- [ ] ETL — steps in [etl/README.md § 13](etl/README.md#13-implementation-steps)
- [ ] MCP server: stateless Streamable HTTP endpoint and `/health` (data age, schema version)
- [ ] MCP server: `/metrics` with aggregate usage metrics
- [ ] MCP server: tools (design still open)
- [ ] Container images for `mcp` and `etl`
- [ ] Local development: Postgres in `compose.yaml`, dev data dump script
- [x] Deploy: platform stack (Traefik, Postgres), app stack skeleton, monitoring stack, env examples
- [ ] Deploy: remaining steps in [deploy/README.md](deploy/README.md#todo) (deploy script, ETL timers, roles, host
      scripts, dashboards, bootstrap runbook)
- [x] CI: workspace and deploy config checks; deploy and GHCR cleanup workflows (manual trigger only)
- [ ] CI: enable push-triggered deploys and the cleanup schedule (TODOs in `.github/workflows/`)
