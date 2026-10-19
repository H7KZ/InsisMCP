# Open questions

Advisor-facing items are tracked in the root [TODO.md](../../TODO.md); this file holds the design consequences.

| # | Question                                                                                       | Affects                                                          |
|---|------------------------------------------------------------------------------------------------|------------------------------------------------------------------|
| 1 | Real time the `isis-db2` refresh finishes                                                      | ETL timers (07:30 / 08:00 are placeholders)                       |
| 2 | Oracle version of `isis-db2`                                                                    | `node-oracledb` Thin mode needs ≥ 12.1; otherwise Thick mode + Instant Client in the ETL image |
| 4 | May extract SQL (InSIS internal view/table names) be public?                                   | If not: `etl/sql/extract/` gitignored, shipped to the VM separately |
| 5 | Does the NDA allow a local copy of the extracted `model` data?                                 | `scripts/pull-dev-dump.sh`                                        |
| 6 | DNS name `mcp.vse.cz` for production (`bpmcp.vse.cz` for dev already points at the VM)         | Go-live of production, `deploy.yml` production trigger            |
| 7 | Thesis schedule mentions Zabbix; this design uses Prometheus/Grafana                           | Whether VŠE expects Zabbix integration in addition                |
| 8 | Existing Docker networks on the VM (2 bridges seen)                                            | Clean up or keep before bootstrap                                 |
| 9 | Rate-limit values in Traefik                                                                   | Decide once real traffic is seen                                  |
