# Open questions

Advisor-facing items are tracked in the root [TODO.md](../../TODO.md); this file holds the design consequences.

| # | Question                                                                                       | Affects                                                          |
|---|------------------------------------------------------------------------------------------------|------------------------------------------------------------------|
| 1 | Real time the `isis-db2` refresh finishes                                                      | ETL timers (07:30 / 08:00 are placeholders)                       |
| 2 | Oracle version of `isis-db2`                                                                    | `node-oracledb` Thin mode needs ≥ 12.1; otherwise Thick mode + Instant Client in the ETL image |
| 3 | Upstream proxy: TLS termination, forwarded port, both hostnames, SSE without buffering, idle timeout, `X-Forwarded-*`, proxy source IP | Traefik entrypoint, trusted IPs, `DOCKER-USER` rule, Streamable HTTP |
| 4 | May extract SQL (InSIS internal view/table names) be public?                                   | If not: `etl/sql/extract/` gitignored, shipped to the VM separately |
| 5 | Does the NDA allow a local copy of the extracted `model` data?                                 | `scripts/pull-dev-dump.sh`                                        |
| 6 | DNS for `mcp.insis.cz` and `bpmcp.insis.cz` → VŠE proxy → VM                                    | Go-live                                                           |
| 7 | Thesis schedule mentions Zabbix and `bpmcp.vse.cz`; this design uses Prometheus/Grafana and `insis.cz` names | Whether VŠE expects Zabbix integration in addition; update schedule wording |
| 8 | Existing Docker networks/containers on the VM (2 bridges, 2 running containers seen)           | Clean up or keep before bootstrap                                 |
| 9 | Rate-limit values in Traefik                                                                   | Decide once real traffic is seen                                  |
