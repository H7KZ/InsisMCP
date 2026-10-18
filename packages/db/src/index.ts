/**
 * Contract between the ETL (writes the database) and the MCP server (reads it).
 *
 * TODO: implement once the first model tables exist (see etl/README.md):
 * - SCHEMA_VERSION: bumped with every `model` change; the ETL records it, the MCP server checks it on /health
 * - names of the snapshot schemas (`raw`, `model`, `meta`) and their staging/previous suffixes
 * - types of the `meta` tables and a reader for the live snapshot (data age)
 */
export {}
