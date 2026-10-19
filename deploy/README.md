# deploy/

Everything that runs on the VM. Design and reasons: [planning/infra/](../planning/infra/README.md).

> **Status: skeleton.** The shared stacks (platform, monitoring) are complete configs but not yet run on the VM; the
> hardened container settings are untested. Start with [BOOTSTRAP.md](BOOTSTRAP.md); the app stack and the deploy
> machinery wait for the service images. Open items are listed below and in [TODO.md](../TODO.md).

## Layout

| Path                 | What                                                           | On the VM                                   |
|----------------------|----------------------------------------------------------------|---------------------------------------------|
| `stacks/platform/`   | Traefik (HTTPS on 443), socket proxy, Postgres; shared         | `/srv/insis-mcp/platform/`                  |
| `stacks/monitoring/` | Prometheus, Alertmanager, Loki, Alloy, Grafana                 | `/srv/insis-mcp/monitoring/`                |
| `stacks/app/`        | One environment (`prod` or `dev`): MCP server and ETL          | `/srv/insis-mcp/app/<env>/releases/<sha>/`  |
| `env/*.env.example`  | Templates of the hand-made secret files                        | `/etc/insis-mcp/*.env` (`root:root 600`)    |

Compose projects on the VM: `platform`, `monitoring`, `insis-prod`, `insis-dev`. Prod and dev use the same app compose
file with different env files.

Networks (created by the platform stack):

| Network | Who                                             | Notes                                     |
|---------|-------------------------------------------------|-------------------------------------------|
| `edge`  | Traefik, MCP servers, Alloy                     | Traefik routes to containers on it        |
| `db`    | Postgres, MCP servers, ETL, Alloy               | `internal`: no internet access            |
| `socket`| Socket proxy, Traefik, Alloy                    | `internal`; read-only Docker API          |

Starting a shared stack by hand:

```bash
docker compose -p platform -f /srv/insis-mcp/platform/compose.yml --env-file /etc/insis-mcp/platform.env up -d
docker compose -p monitoring -f /srv/insis-mcp/monitoring/compose.yml --env-file /etc/insis-mcp/monitoring.env up -d
```

## How the pieces connect

- **Routing**: internet → Traefik on 443 (HTTPS, Let's Encrypt; port 80 only redirects) → container chosen by Docker
  labels (`Host(...)` rules in the app stack). Traefik only routes to containers whose healthcheck reports healthy.
  Grafana is not routed: open it through an SSH tunnel ([BOOTSTRAP.md § 9](BOOTSTRAP.md)).
- **Docker access**: only the `socket-proxy` container touches `docker.sock` (read-only, containers and networks);
  Traefik and Alloy talk to it over the internal `socket` network.
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
- [ ] **Deploy script** `bin/deploy.sh <env> <sha>`, installed by hand as root-owned `/usr/local/sbin/insis-deploy` and
      run by the CI key through sudo ([BOOTSTRAP.md § 5](BOOTSTRAP.md)): check the SHA is on `develop` / `main`, fetch
      `stacks/app/` at that commit, refuse privileged compose settings, write the state file, pull, run the ETL if its
      image changed, `up`, wait for healthy, roll back on failure. Details:
      [planning/infra/deployment.md](../planning/infra/deployment.md).
- [ ] **ETL on the host**: `bin/etl-run.sh` (lock + `compose run etl`), systemd service/timers per env, failure
      notification to Discord. Details: [etl/README.md](../etl/README.md#7-when-it-runs).
- [ ] **Databases and roles**: script to create `insis_prod` / `insis_dev`, the `etl_*` and `mcp_*` roles and the
      `alloy_monitor` role.
- [ ] **Host scripts**: weekly usage report, weekly cleanup, reboot-required flag for monitoring.
- [ ] **Grafana dashboards**: overview (health, resources, logs) and usage (prod), provisioned from files.
- [x] **Bootstrap runbook** [BOOTSTRAP.md](BOOTSTRAP.md): threat model, SSH, deploy user, firewall, Docker daemon, env
      files, first start, verification. Steps marked **[later]** wait for the items above.
