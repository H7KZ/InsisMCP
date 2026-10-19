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

The VM has its own public address and is reachable from the internet; no proxy sits in front. **Traefik** faces clients
directly:

- `:443` HTTPS, certificates from Let's Encrypt (HTTP-01 challenge, production CA), stored in the `acme` volume; TLS 1.2
  minimum, HSTS and other security headers (`traefik/dynamic.yml`);
- `:80` only redirects to HTTPS and answers the ACME challenge;
- rate limit per client IP: 60 req/s, burst 100 (middleware per app stack, env-tunable).

| Host             | Target                                                  |
|------------------|---------------------------------------------------------|
| `bpmcp.vse.cz`   | MCP dev                                                 |
| `mcp.vse.cz`     | MCP prod (later; DNS record needed)                     |
| Grafana          | not routed: `127.0.0.1:3000`, reached by an SSH tunnel  |

Routes are declared by each stack's Docker labels; `/metrics` of the MCP server stays on an internal port and is never
routed. Traefik reads Docker only through a read-only socket proxy (`socket-proxy`, network `socket`, no internet).

## Services

| Service         | Instances           | Notes                                      |
|-----------------|---------------------|--------------------------------------------|
| Traefik         | 1 shared            | entrypoints `:80`, `:443`                   |
| Socket proxy    | 1 shared            | read-only Docker API for Traefik and Alloy  |
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
- Networks: external `edge` (Traefik ↔ MCP), external `db` (Postgres ↔ MCP/ETL/Alloy), external `socket` (socket proxy ↔
  Traefik/Alloy). `db` and `socket` have no internet access.
- Postgres publishes **no port**. Dumps go through `docker exec` over SSH.
- Volumes: Postgres data, Prometheus, Loki, Grafana. MCP and ETL are stateless.

## Images

- `ghcr.io/h7kz/insis-mcp`, `ghcr.io/h7kz/insis-etl`; public (public repo) → no registry credentials on the VM.
- Multi-stage, `node:24-alpine`, non-root user.
- Every container runs with `no-new-privileges`, all capabilities dropped (platform-level exceptions are commented in
  the compose files), read-only root filesystem with a `/tmp` tmpfs, pid and memory limits. Alloy is the exception
  (host-wide read access for metrics).
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
| `/etc/insis-mcp/`       | secrets: `platform.env`, `monitoring.env`, `prod.env`, `dev.env` | you, by hand (sudo) | `root:root 600` |
| `/srv/insis-mcp/`       | deploy bundle: compose files, configs, scripts     | deploy script (root) | `root`, `750`    |
| `/var/lib/insis-mcp/<env>/` | deploy state: `current`, `last-good`, `deploys.log` | deploy script (root) | `root`, `750` |
| `/usr/local/sbin/insis-deploy` | the deploy script                           | you, by hand, from a reviewed commit | `root`, `750` |

```
/srv/insis-mcp/
  platform/     compose.yml, traefik/dynamic.yml
  monitoring/   compose.yml, prometheus/, grafana/, loki/, alloy/
  app/          compose.yml          (used by insis-prod and insis-dev)
  bin/          etl-run.sh, usage-report.sh
/etc/systemd/system/
  insis-etl@.service, insis-etl@prod.timer, insis-etl@dev.timer,
  insis-usage-report.service/.timer, insis-maintenance.service/.timer
```

Why this split:

- `/srv/insis-mcp/` is fully disposable and re-syncable; a bad sync cannot wipe secrets.
- `deploy` (the CI identity) can neither read nor change secrets: only the root-owned deploy script uses them.
- `/srv` (FHS: data served by this system) rather than a home directory: not tied to a login account, obvious to
  other admins (e.g. the advisor), works with systemd `ProtectHome=`.
- Compose reads secrets via `--env-file /etc/insis-mcp/<stack>.env` plus per-service `env_file:` (Oracle variables only
  on `etl`).
- Repo ships `deploy/env/*.env.example`. Copies of the real env files are kept in a password manager.

## Users and access

| User      | Purpose                         | Access                                                                    |
|-----------|---------------------------------|---------------------------------------------------------------------------|
| you       | administration                  | SSH key, sudo                                                             |
| `deploy`  | CI deploys                      | no password, **not** in the `docker` group; SSH key with forced command; sudo for one script only |

- `docker` group = root-equivalent, so `deploy` is not in it. The key's forced command is
  `restrict,command="sudo /usr/local/sbin/insis-deploy $SSH_ORIGINAL_COMMAND"`, and sudoers allows only that script.
  CI can only send `<env> <sha>`, validated against `^(prod|dev) [0-9a-f]{40}$`. No shell, no scp, no port forwarding.
- The script is root-owned and installed by hand, so a stolen CI key cannot change it. It checks that the SHA is on the
  matching protected branch and refuses compose files that ask for privileges (details: `deploy/BOOTSTRAP.md` § 5).
- sshd: root login off, password auth off, `AllowUsers`, `fail2ban`.

## Firewall

- Published ports: Traefik `80` and `443` (world), Grafana `127.0.0.1:3000` (loopback). SSH `22` (key only).
- `ufw` for the host; Docker-published ports **bypass ufw**, so the `DOCKER-USER` iptables chain drops everything from
  outside except `80`, `443` and replies to connections the VM started.
- Everything else unpublished.
