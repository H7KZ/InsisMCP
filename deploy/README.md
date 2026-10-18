# deploy/

Everything that runs on the VM. Design and reasons: [planning/infra/](../planning/infra/README.md).

> **Status: skeleton.** The shared stacks (platform, monitoring) are complete configs; the app stack and the deploy
> machinery wait for the service images. Open items are listed below and in [TODO.md](../TODO.md).

## Layout

| Path                 | What                                                           | On the VM                                   |
|----------------------|----------------------------------------------------------------|---------------------------------------------|
| `stacks/platform/`   | Traefik (edge, port 8080) and Postgres, shared by all envs     | `/srv/insis-mcp/platform/`                  |
| `stacks/monitoring/` | Prometheus, Alertmanager, Loki, Alloy, Grafana                 | `/srv/insis-mcp/monitoring/`                |
| `stacks/app/`        | One environment (`prod` or `dev`): MCP server and ETL          | `/srv/insis-mcp/app/<env>/releases/<sha>/`  |
| `env/*.env.example`  | Templates of the hand-made secret files                        | `/etc/insis-mcp/*.env` (`root:deploy 640`)  |

Compose projects on the VM: `platform`, `monitoring`, `insis-prod`, `insis-dev`. Prod and dev use the same app compose
file with different env files.

Networks (created by the platform stack):

| Network | Who                                             | Notes                                     |
|---------|-------------------------------------------------|-------------------------------------------|
| `edge`  | Traefik, MCP servers, Grafana, Alloy            | Traefik routes to containers on it        |
| `db`    | Postgres, MCP servers, ETL, Alloy               | `internal`: no internet access            |

Starting a shared stack by hand:

```bash
docker compose -p platform -f /srv/insis-mcp/platform/compose.yml --env-file /etc/insis-mcp/platform.env up -d
docker compose -p monitoring -f /srv/insis-mcp/monitoring/compose.yml --env-file /etc/insis-mcp/monitoring.env up -d
```

## How the pieces connect

- **Routing**: the VŠE upstream proxy forwards HTTPS traffic as plain HTTP to port 8080 → Traefik → container chosen by
  Docker labels (`Host(...)` rules in the app and monitoring stacks). Traefik only routes to containers whose
  healthcheck reports healthy.
- **Metrics**: Alloy scrapes the host, containers, Postgres and every container labelled `insis.metrics.port=<port>`
  (env from `insis.env`), and pushes it all to Prometheus. Prometheus evaluates `rules.yml` and sends alerts to
  Alertmanager → Discord.
- **Logs**: Alloy ships Docker and journald logs to Loki; Grafana shows both.
- **Images**: CI builds `ghcr.io/h7kz/insis-{mcp,etl}:sha-<commit>`; the deploy script writes the image refs into a
  state file that compose reads as a second env file.

## TODO

In order; each item is its own step.

- [ ] **Service images**: `mcp/Dockerfile`, `etl/Dockerfile` (multi-stage, `node:24-alpine`, non-root, build context =
      repo root). The MCP image needs a `HEALTHCHECK` on `/health` (Traefik routes healthy containers only, deploys
      wait for it).
- [ ] **Service metrics**: MCP server exposes `/metrics` on an internal port → add `insis.metrics.port` to the `mcp`
      service in `stacks/app/compose.yml`; then the data-age alerts in `stacks/monitoring/prometheus/rules.yml`.
- [ ] **Deploy script** `bin/deploy.sh <env> <sha>` (forced SSH command of the CI key): fetch `stacks/app/` at that
      commit, write the state file, pull, run the ETL if its image changed, `up`, wait for healthy, roll back on
      failure. Details: [planning/infra/deployment.md](../planning/infra/deployment.md).
- [ ] **ETL on the host**: `bin/etl-run.sh` (lock + `compose run etl`), systemd service/timers per env, failure
      notification to Discord. Details: [etl/README.md](../etl/README.md#7-when-it-runs).
- [ ] **Databases and roles**: script to create `insis_prod` / `insis_dev`, the `etl_*` and `mcp_*` roles and the
      `alloy_monitor` role.
- [ ] **Host scripts**: weekly usage report, weekly cleanup, reboot-required flag for monitoring.
- [ ] **Grafana dashboards**: overview (health, resources, logs) and usage (prod), provisioned from files.
- [ ] **Bootstrap runbook** `BOOTSTRAP.md`: packages, `deploy` user and SSH key, firewall, env files, first start.
