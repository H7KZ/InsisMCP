# Monitoring, alerting, usage, maintenance

## Stack

All on the VM, compose project `monitoring`.

| Component      | Role                                                                                          | ~RAM        |
|----------------|-----------------------------------------------------------------------------------------------|-------------|
| **Prometheus** | metrics, retention **400 d** (low cardinality → small disk; covers the whole thesis period)   | 200–300 MB  |
| **Grafana**    | dashboards, alerting → Discord (native contact point); at `mcp.insis.cz/grafana`, login only | 100–150 MB  |
| **Alloy**      | single agent: host metrics, container metrics, Postgres exporter, Docker + journald logs → Loki | 100–150 MB |
| **Loki**       | logs, 14 d retention, filesystem storage                                                       | 150–250 MB  |

Metric sources: Alloy (host, containers, Postgres), Traefik `/metrics` (requests, latency, status per route), MCP
`/metrics` (tool calls, latency, errors, response size, data age).

## Environments

Both environments are scraped; everything carries an `env` label (`prod` | `dev`).

|                               | prod            | dev              |
|-------------------------------|-----------------|------------------|
| Resource / health dashboards  | ✅               | ✅                |
| Alerts                        | `#alerts`       | `#alerts-dev`    |
| ETL failure alert             | `#alerts`       | `#alerts-dev`    |
| Deploy notifications          | `#deploys`      | `#deploys`       |
| Usage dashboard, weekly summary | ✅             | ❌ (own testing traffic) |

Dev metrics catch regressions (latency, errors, memory) right after a `develop` deploy, before promotion.

Discord webhook URLs live in `/etc/insis-mcp/*.env`.

## Alerting

Two independent paths:

1. **Grafana → Discord**: CPU / memory / disk (> 80 %) high, container down or restarting, Postgres down, 5xx rate,
   data age > 36 h, reboot required.
2. **ETL → Discord directly**: systemd `OnFailure=` → `curl` webhook with unit name and last journal lines. Works even
   when the monitoring stack is down.

## Usage analytics

The server is stateless and has no auth: there are no users and no sessions to count. Measured, in aggregate only:

| Metric                                         | Labels                                                             | Purpose                         |
|------------------------------------------------|--------------------------------------------------------------------|---------------------------------|
| tool calls                                     | `tool`, `status`                                                   | popularity, error rate          |
| tool latency histogram                         | `tool`                                                             | p50 / p95 (thesis ch. 7)        |
| response size: bytes and **estimated tokens**  | `tool`                                                             | token cost (thesis ch. 3, 7)    |
| `initialize` count                             | `client_name` from `clientInfo`, self-reported, normalized to a known list + `other` | connections, client mix |
| HTTP requests / status                         | route (Traefik)                                                    | traffic                         |

Not collected: IP addresses, unique users, sessions, geolocation, tool argument values (may contain users' free text),
tool results.

Privacy rules:

- Traefik access logs drop client address fields (or are off; metrics suffice).
- App logs: tool name, status, duration only.
- Traefik rate limiting by IP is in memory only, never persisted.
- Bounded label cardinality: no free-text labels.

Outputs:

- Grafana **Usage** dashboard (prod).
- **Weekly Discord summary**: `insis-usage-report.timer` runs `usage-report.sh`, which queries the Prometheus API.
- Thesis evaluation numbers: export to CSV from Grafana (panel → Inspect → Data) when needed.

## Backups

None.

| Data                         | Why no backup                                   |
|------------------------------|-------------------------------------------------|
| Postgres `raw` / `model`     | rebuildable from Oracle by rerunning the ETL    |
| Grafana dashboards / alerts  | provisioned from the repo                       |
| Prometheus / Loki            | accepted loss; usage numbers exported to CSV for the thesis when needed |
| `/etc/insis-mcp/*.env`       | copies kept in a password manager               |

Can be added later.

## Host maintenance

- `unattended-upgrades`: security updates only, **no automatic reboot**; "reboot required" alert (Alloy textfile
  collector reads `/var/run/reboot-required`) → manual reboot.
- Docker `daemon.json`: `json-file` logs, `max-size=10m`, `max-file=3` (Loki keeps the copy).
- journald `SystemMaxUse=1G`.
- Weekly `insis-maintenance.timer`: `docker image prune` (keeps running and `last-good` images), `docker builder prune`.
- ETL drops snapshots older than `previous`; autovacuum handles the rest.
- Disk > 80 % alert catches anything missed.
