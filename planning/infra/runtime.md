# Runtime: host, services, stacks, security

## Host

| | |
|---|---|
| Platform | VMware VM provided by VŠE |
| CPU / RAM / disk | 4 vCPU (Xeon E5-2630 v4, 2.2 GHz) / 8 GiB + 4 GiB swap / 100 GiB |
| OS | Ubuntu 24.04 LTS |
| Access | sudo, Docker allowed; SSH open to the internet, key-only |
| Oracle | `isis-db2` reachable only from this VM |

One VM runs everything: both environments, Postgres, ETL, monitoring.

## Edge

All InSIS services share one public IP, so a **VŠE upstream proxy** sits in front and forwards traffic to the VM on
port **8080** (port and details to confirm with the advisor — see [TODO.md](../../TODO.md)).

On the VM, **Traefik** (plain HTTP, no TLS/ACME) routes:

| Host / path              | Target         |
|--------------------------|----------------|
| `mcp.insis.cz`           | MCP prod       |
| `bpmcp.insis.cz`         | MCP dev        |
| `mcp.insis.cz/grafana`   | Grafana (login required, anonymous off, sub-path config) |

Why a local proxy instead of one port per service: one port to ask the advisor for; routes declared by each stack's
Docker labels; built-in rate limiting and Prometheus metrics; new routes need no ticket upstream.

Traefik trusts `X-Forwarded-*` only from the upstream proxy IP.

## Services

| Service         | Instances           | Notes                                      |
|-----------------|---------------------|--------------------------------------------|
| Traefik         | 1 shared            | entrypoint `:8080`                          |
| Postgres 18     | 1 shared            | databases `insis_prod`, `insis_dev`        |
| MCP server      | 1 per env           | stateless Streamable HTTP                  |
| ETL             | 1 per env, one-shot | systemd timer                              |
| Monitoring      | 1 shared            | see [monitoring.md](monitoring.md)         |

**No Redis.** Data changes once a day, Postgres is on the same host, the server is stateless (no session store), rate
limiting lives in Traefik. If hot queries ever matter: in-process LRU keyed by snapshot ID (auto-invalidates on swap).
Measure first.

Every container gets a memory limit.

## Compose stacks

| Project      | Services                                     | Changes when          |
|--------------|----------------------------------------------|-----------------------|
| `platform`   | traefik, postgres                            | rarely, manually      |
| `monitoring` | prometheus, grafana, loki, alloy             | rarely, manually      |
| `insis-prod` | mcp, etl                                     | every `main` deploy   |
| `insis-dev`  | mcp, etl                                     | every `develop` deploy |

- `insis-prod` and `insis-dev` use **the same compose file**; they differ only by env file (env name, hostname, image
  tags, DB name and credentials). No drift between environments.
- `etl` sits under compose profile `etl`: `up -d` never starts it.
- Networks: external `edge` (Traefik ↔ MCP, Grafana), external `db` (Postgres ↔ MCP/ETL/Alloy).
- Postgres publishes **no port**. Dumps go through `docker exec` over SSH.
- Volumes: Postgres data, Prometheus, Loki, Grafana. MCP and ETL are stateless.

## Images

- `ghcr.io/h7kz/insis-mcp`, `ghcr.io/h7kz/insis-etl`; public (public repo) → no registry credentials on the VM.
- Multi-stage, `node:24-alpine`, non-root user.
- `pg` and `oracledb` (Thin) are pure JS → tsup bundles everything → runtime image = Node + `dist/`.

## Database roles

Per environment:

| Role        | Rights                                         |
|-------------|------------------------------------------------|
| `etl_<env>` | owns its database's schemas, writes            |
| `mcp_<env>` | read-only on `model` and `meta`                |

The MCP server physically cannot write. The Postgres superuser exists only in `platform.env`.

## Server filesystem

Three roots, three owners:

| Path                    | Content                                            | Managed by     | Owner / mode          |
|-------------------------|----------------------------------------------------|----------------|-----------------------|
| `/etc/insis-mcp/`       | secrets: `platform.env`, `monitoring.env`, `prod.env`, `dev.env` | you, by hand (sudo) | `root:deploy 640` |
| `/srv/insis-mcp/`       | deploy bundle: compose files, configs, scripts     | CI (`deploy.sh`) | `deploy`, `750`      |
| `/var/lib/insis-mcp/<env>/` | deploy state: `current`, `last-good`, `deploys.log` | `deploy.sh`    | `deploy`, `750`       |

```
/srv/insis-mcp/
  platform/     compose.yml, traefik/
  monitoring/   compose.yml, prometheus/, grafana/, loki/, alloy/
  app/          compose.yml          (used by insis-prod and insis-dev)
  bin/          deploy.sh, etl-run.sh, usage-report.sh
/etc/systemd/system/
  insis-etl@.service, insis-etl@prod.timer, insis-etl@dev.timer,
  insis-usage-report.service/.timer, insis-maintenance.service/.timer
```

Why this split:

- `/srv/insis-mcp/` is fully disposable and re-syncable; a bad sync cannot wipe secrets.
- `deploy` (the CI identity) can read secrets but not change them.
- `/srv` (FHS: data served by this system) rather than a home directory: not tied to a login account, obvious to
  other admins (e.g. the advisor), works with systemd `ProtectHome=`.
- Compose reads secrets via `--env-file /etc/insis-mcp/<stack>.env` plus per-service `env_file:` (Oracle variables only
  on `etl`).
- Repo ships `deploy/env/*.env.example`. Copies of the real env files are kept in a password manager.

## Users and access

| User      | Purpose                         | Access                                                                    |
|-----------|---------------------------------|---------------------------------------------------------------------------|
| you       | administration                  | SSH key, sudo                                                             |
| `deploy`  | CI deploys, runs stacks         | no password, no sudo, in `docker` group; SSH key with forced command      |

- `docker` group = root-equivalent. Contained by the forced command:
  `restrict,command="/srv/insis-mcp/bin/deploy.sh"` in `authorized_keys`. CI can only send `<env> <sha>`, validated
  against `^(prod|dev) [0-9a-f]{40}$`. No shell, no scp, no port forwarding.
- sshd: root login off, password auth off.

## Firewall

- Only Traefik publishes a port (`8080`).
- Docker-published ports **bypass ufw** → restrict `8080` to the upstream proxy IP in the `DOCKER-USER` iptables chain.
- Everything else unpublished.
