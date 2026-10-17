# Infrastructure design

How the InSIS MCP Server is built, deployed and run. Design only — nothing here is implemented yet.

| File                                     | Covers                                                                  |
|------------------------------------------|-------------------------------------------------------------------------|
| [etl.md](etl.md)                         | Oracle `isis-db2` → Postgres: extracts, layers, schedule, data age      |
| [runtime.md](runtime.md)                 | Host, services, compose stacks, server layout, users, secrets, security |
| [deployment.md](deployment.md)           | Environments, CI/CD, image identity, deploy script, rollback, bootstrap |
| [monitoring.md](monitoring.md)           | Metrics, logs, alerting, usage analytics, host maintenance              |
| [repo-layout.md](repo-layout.md)         | New folders and files this design implies                               |
| [open-questions.md](open-questions.md)   | Unresolved points                                                       |

Questions for the thesis advisor live in the root [TODO.md](../../TODO.md).

## Overview

```
                    Internet
                       │  HTTPS
          ┌────────────▼────────────┐
          │  VŠE upstream proxy     │  shared IP, TLS (to confirm)
          └────────────┬────────────┘
                       │  HTTP :8080
┌──────────────────────▼───────────────────────────────────────────┐
│ VM (VMware, 4 vCPU, 8 GiB, 100 GiB, Ubuntu 24.04)                 │
│                                                                    │
│  Traefik ──► mcp.insis.cz            ──► mcp (prod)                │
│          ──► bpmcp.insis.cz          ──► mcp (dev)                 │
│          ──► mcp.insis.cz/grafana    ──► Grafana                   │
│                                                                    │
│  Postgres 18 ─ insis_prod / insis_dev    ◄── mcp (read-only role)  │
│                                          ◄── etl (owner role)      │
│                                                                    │
│  etl (one-shot, systemd timer) ──► Oracle isis-db2 (VM-only reach) │
│                                                                    │
│  Prometheus · Grafana · Loki · Alloy ──► Discord webhooks          │
└────────────────────────────────────────────────────────────────────┘
```

## Decisions at a glance

1. **Data path**: nightly ETL from `isis-db2` (advisor-curated SQL extracts) into a project-owned Postgres; full rebuild
   into a new schema, validated, atomically swapped. The MCP server never talks to Oracle.
2. **One VM, two environments**: `production` (`mcp.insis.cz`, from `main`) and `development` (`bpmcp.insis.cz`, from
   `develop`). One Postgres instance, one database per environment, own MCP container and own ETL run per environment.
3. **Edge**: VŠE's upstream proxy forwards to VM port `8080`; Traefik (plain HTTP) routes by host/path.
4. **No Redis**: data changes once a day, Postgres is local, server is stateless.
5. **Compose stacks**: `platform` (Traefik, Postgres), `monitoring`, `insis-prod`, `insis-dev` (one shared app compose
   file).
6. **Filesystem roots**: `/etc/insis-mcp/` secrets (hand-managed), `/srv/insis-mcp/` deploy bundle (CI-managed),
   `/var/lib/insis-mcp/` deploy state.
7. **CI/CD**: GitHub-hosted runners push over SSH to a forced-command `deploy` user; images keyed by subtree hash and
   retagged instead of rebuilt; automatic rollback on failed health check.
8. **Monitoring**: Prometheus + Grafana + Loki + Alloy on the VM; alerts to Discord; aggregate, non-identifying usage
   metrics; weekly usage summary to Discord.
9. **No backups**: everything in Postgres is rebuildable from Oracle; Grafana is provisioned from the repo.
