select task8_rollout.assert_identity(
  :'task8_validation_ref',
  :'task8_production_system_identifier',
  :'task8_validation_system_identifier',
  :'task8_database_oid'::oid,
  :'task8_marker_digest',
  :'task8_provenance_id'
);
