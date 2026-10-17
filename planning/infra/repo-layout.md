# Repo layout

npm workspaces monorepo. New items marked **new**.

```
package.json, package-lock.json   new: workspaces mcp, etl, packages/*  (lockfile moves from mcp/ to root)
compose.yaml                      new: local dev Postgres (+ mcp) on the laptop
TODO.md                           new: questions for the advisor, placeholders to fix
.local/                           new, gitignored: local dumps
mcp/                              MCP server (existing)
etl/                              new
  src/                            generic runner: extract → load raw → transform → validate → swap
  sql/extract/*.sql + manifest    Oracle extracts (advisor's queries)
  sql/model/*.sql                 model DDL
  sql/transform/*.sql             raw → model
  Dockerfile
packages/db/                      new: shared contract — SCHEMA_VERSION + model row types (mcp + etl)
deploy/                           new
  BOOTSTRAP.md                    one-time manual runbook
  bin/                            deploy.sh, etl-run.sh, usage-report.sh
  stacks/platform/                compose.yml, traefik/
  stacks/monitoring/              compose.yml, prometheus/, grafana/, loki/, alloy/
  stacks/app/                     compose.yml (prod + dev)
  systemd/                        insis-etl@.service/.timer, insis-usage-report.*, insis-maintenance.*
  env/*.env.example
scripts/pull-dev-dump.sh          new: laptop → ssh → pg_dump model → .local/
.github/workflows/                new: ci.yml, deploy.yml, ghcr-cleanup.yml (thesis.yml existing)
planning/infra/                   this design
```

Notes:

- `packages/db` is the reason for workspaces: `SCHEMA_VERSION` has one source; ETL writes it, MCP checks it.
- `deploy/` is what `deploy.sh` fetches into `/srv/insis-mcp/` (`deploy/stacks/*` → `/srv/insis-mcp/*`).
- `etl/sql/extract/` may have to stay out of the public repo (see [open-questions.md](open-questions.md)).
- Moving the lockfile to the root is a small tooling change on its own branch.
