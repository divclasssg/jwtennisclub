\set ON_ERROR_STOP on
\set QUIET on

\ir task8_assert_identity.sql

select pg_catalog.json_build_object(
  'projectRef',
  marker.project_ref,
  'systemIdentifier',
  (pg_catalog.pg_control_system()).system_identifier::text,
  'databaseOid',
  marker.database_oid::text,
  'databaseName',
  pg_catalog.current_database(),
  'sourceSystemIdentifier',
  marker.source_system_identifier,
  'markerDigest',
  marker.marker_digest,
  'provenanceId',
  marker.provenance_id
)::text
from task8_rollout.provenance as marker
where marker.singleton;
