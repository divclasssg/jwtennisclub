\set ON_ERROR_STOP on
\set QUIET on

select pg_catalog.set_config(
  'task8.validation_ref',
  :'task8_validation_ref',
  false
);
select pg_catalog.set_config(
  'task8.production_system_identifier',
  :'task8_production_system_identifier',
  false
);
select pg_catalog.set_config(
  'task8.source_snapshot_at',
  :'task8_source_snapshot_at',
  false
);
select pg_catalog.set_config(
  'task8.provenance_id',
  :'task8_provenance_id',
  false
);
select pg_catalog.set_config(
  'task8.approval_id',
  :'task8_approval_id',
  false
);

begin;

do $preflight$
declare
  validation_ref text := btrim(
    pg_catalog.current_setting('task8.validation_ref')
  );
  production_identifier text :=
    btrim(
      pg_catalog.current_setting('task8.production_system_identifier')
    );
  actual_identifier text :=
    (pg_catalog.pg_control_system()).system_identifier::text;
  source_snapshot_at timestamptz :=
    pg_catalog.current_setting('task8.source_snapshot_at')::timestamptz;
begin
  if validation_ref = 'ydiusirreirhbvlftegp' then
    raise exception 'production project is forbidden';
  end if;
  if validation_ref !~ '^[a-z]{20}$' then
    raise exception 'validation project ref is invalid';
  end if;
  if production_identifier !~ '^[0-9]{10,32}$' then
    raise exception 'production database fingerprint is invalid';
  end if;
  if actual_identifier = production_identifier then
    raise exception 'validation database fingerprint matches production';
  end if;
  if pg_catalog.current_database() <> 'postgres' then
    raise exception 'validation database name must be postgres';
  end if;
  if btrim(pg_catalog.current_setting('task8.provenance_id')) = ''
     or btrim(pg_catalog.current_setting('task8.approval_id')) = '' then
    raise exception 'provenance and approval IDs are required';
  end if;
  if source_snapshot_at > pg_catalog.clock_timestamp() then
    raise exception 'clone source snapshot cannot be in the future';
  end if;
end;
$preflight$;

create schema if not exists task8_rollout;

create table if not exists task8_rollout.provenance (
  singleton boolean primary key default true check (singleton),
  project_ref text not null check (project_ref ~ '^[a-z]{20}$'),
  system_identifier text not null check (
    system_identifier ~ '^[0-9]{10,32}$'
  ),
  database_oid oid not null,
  source_system_identifier text not null check (
    source_system_identifier ~ '^[0-9]{10,32}$'
  ),
  source_snapshot_at timestamptz not null,
  provenance_id text not null check (length(btrim(provenance_id)) > 0),
  approval_id text not null check (length(btrim(approval_id)) > 0),
  marker_digest text not null check (marker_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

create table if not exists task8_rollout.telemetry_capability (
  singleton boolean primary key default true check (singleton),
  source_name text not null check (
    source_name = 'instrumented_lock_acquisition'
  ),
  resolution_ms numeric not null check (
    resolution_ms > 0 and resolution_ms <= 10
  ),
  verified_at timestamptz not null,
  approval_id text not null check (length(btrim(approval_id)) > 0)
);

do $insert_marker$
declare
  marker_digest text;
begin
  marker_digest := pg_catalog.encode(
    extensions.digest(
      pg_catalog.concat_ws(
        '|',
        btrim(pg_catalog.current_setting('task8.validation_ref')),
        (pg_catalog.pg_control_system()).system_identifier::text,
        (
          select database.oid::text
          from pg_catalog.pg_database as database
          where database.datname = pg_catalog.current_database()
        ),
        btrim(
          pg_catalog.current_setting('task8.production_system_identifier')
        ),
        (
          pg_catalog.current_setting('task8.source_snapshot_at')::timestamptz
        )::text,
        btrim(pg_catalog.current_setting('task8.provenance_id')),
        btrim(pg_catalog.current_setting('task8.approval_id'))
      ),
      'sha256'
    ),
    'hex'
  );

  insert into task8_rollout.provenance (
    singleton,
    project_ref,
    system_identifier,
    database_oid,
    source_system_identifier,
    source_snapshot_at,
    provenance_id,
    approval_id,
    marker_digest
  )
  values (
    true,
    btrim(pg_catalog.current_setting('task8.validation_ref')),
    (pg_catalog.pg_control_system()).system_identifier::text,
    (
      select database.oid
      from pg_catalog.pg_database as database
      where database.datname = pg_catalog.current_database()
    ),
    btrim(
      pg_catalog.current_setting('task8.production_system_identifier')
    ),
    pg_catalog.current_setting('task8.source_snapshot_at')::timestamptz,
    btrim(pg_catalog.current_setting('task8.provenance_id')),
    btrim(pg_catalog.current_setting('task8.approval_id')),
    marker_digest
  )
  on conflict (singleton) do nothing;
end;
$insert_marker$;

create or replace function task8_rollout.assert_identity(
  expected_project_ref text,
  expected_production_system_identifier text,
  expected_validation_system_identifier text,
  expected_database_oid oid,
  expected_marker_digest text,
  expected_provenance_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  marker task8_rollout.provenance%rowtype;
  normalized_ref text := btrim(expected_project_ref);
  actual_identifier text :=
    (pg_catalog.pg_control_system()).system_identifier::text;
  actual_database_oid oid;
begin
  if normalized_ref = 'ydiusirreirhbvlftegp' then
    raise exception 'production project is forbidden';
  end if;
  if normalized_ref !~ '^[a-z]{20}$' then
    raise exception 'validation project ref is invalid';
  end if;
  if actual_identifier = btrim(expected_production_system_identifier) then
    raise exception 'validation database fingerprint matches production';
  end if;
  if actual_identifier <> btrim(expected_validation_system_identifier) then
    raise exception 'validation database fingerprint mismatch';
  end if;

  select database.oid
  into strict actual_database_oid
  from pg_catalog.pg_database as database
  where database.datname = pg_catalog.current_database();

  if actual_database_oid <> expected_database_oid
     or pg_catalog.current_database() <> 'postgres' then
    raise exception 'validation database identity mismatch';
  end if;

  select *
  into strict marker
  from task8_rollout.provenance
  where singleton;

  if marker.project_ref <> normalized_ref
     or marker.system_identifier <> actual_identifier
     or marker.database_oid <> actual_database_oid
     or marker.source_system_identifier
       <> btrim(expected_production_system_identifier)
     or marker.marker_digest <> btrim(expected_marker_digest)
     or marker.provenance_id <> btrim(expected_provenance_id) then
    raise exception 'clone provenance marker mismatch';
  end if;
end;
$$;

revoke all on schema task8_rollout
from public, anon, authenticated, service_role;
revoke all on all tables in schema task8_rollout
from public, anon, authenticated, service_role;
revoke execute on function task8_rollout.assert_identity(
  text,
  text,
  text,
  oid,
  text,
  text
)
from public, anon, authenticated, service_role;

commit;

select pg_catalog.json_build_object(
  'projectRef',
  marker.project_ref,
  'systemIdentifier',
  marker.system_identifier,
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
