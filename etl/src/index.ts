/**
 * InSIS ETL: isis-db2 (Oracle) → Postgres snapshot. How it works: etl/README.md.
 *
 * TODO: implement step by step (each step is described in the README):
 * - CLI: `run`, `rollback`, `status`
 * - SQL plan: read the extract manifest and the model/transform/check files
 * - source: stream extracts from isis-db2 (node-oracledb Thin mode)
 * - load: create raw staging tables and fill them with COPY
 * - build: model DDL, transforms, checks
 * - swap: staging → live, live → previous, in one transaction; record the run in `meta`
 */
export {}
