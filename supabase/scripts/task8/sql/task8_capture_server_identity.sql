\set ON_ERROR_STOP on
\set QUIET on

select pg_catalog.json_build_object(
  'systemIdentifier',
  (pg_catalog.pg_control_system()).system_identifier::text,
  'databaseOid',
  (
    select database.oid::text
    from pg_catalog.pg_database as database
    where database.datname = pg_catalog.current_database()
  ),
  'databaseName',
  pg_catalog.current_database()
)::text;
