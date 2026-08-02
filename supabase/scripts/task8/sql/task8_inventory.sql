\set ON_ERROR_STOP on
\set QUIET on
\pset format unaligned
\pset tuples_only on
\pset footer off

begin;
\ir task8_assert_identity.sql

create temporary table task8_table_inventory (
  schema_name text not null,
  table_name text not null,
  row_count bigint not null,
  row_checksum text not null,
  primary key (schema_name, table_name)
) on commit drop;

do $tables$
declare
  table_row record;
  row_count bigint;
  row_checksum text;
begin
  for table_row in
    select schemaname, tablename
    from pg_catalog.pg_tables
    where schemaname in ('public', 'match')
    order by schemaname, tablename
  loop
    execute format(
      $query$
        select count(*)::bigint,
               pg_catalog.encode(extensions.digest(coalesce(
                 pg_catalog.string_agg(
                   pg_catalog.to_jsonb(table_value)::text,
                   E'\n'
                   order by pg_catalog.to_jsonb(table_value)::text
                 ),
                 ''
               ), 'sha256'), 'hex')
        from %I.%I as table_value
      $query$,
      table_row.schemaname,
      table_row.tablename
    )
    into row_count, row_checksum;
    insert into task8_table_inventory values (
      table_row.schemaname,
      table_row.tablename,
      row_count,
      row_checksum
    );
  end loop;
end;
$tables$;

select pg_catalog.json_build_object(
  'schemaVersion',
  2,
  'identity',
  (
    select pg_catalog.json_build_object(
      'projectRef',
      marker.project_ref,
      'systemIdentifier',
      marker.system_identifier,
      'databaseOid',
      marker.database_oid::text,
      'sourceSystemIdentifier',
      marker.source_system_identifier,
      'markerDigest',
      marker.marker_digest,
      'provenanceId',
      marker.provenance_id,
      'sourceSnapshotAt',
      marker.source_snapshot_at
    )
    from task8_rollout.provenance as marker
    where marker.singleton
  ),
  'migrations',
  (
    select coalesce(pg_catalog.json_agg(
      pg_catalog.json_build_object(
        'version',
        migration.version,
        'name',
        migration.name,
        'statementsState',
        case
          when migration.statements is null then 'unavailable'
          else 'recorded'
        end,
        'statementSha256',
        case
          when migration.statements is null then null
          else pg_catalog.encode(extensions.digest(
            array_to_string(migration.statements, E'\n'),
            'sha256'
          ), 'hex')
        end,
        'catalogSha256',
        pg_catalog.encode(extensions.digest(
          pg_catalog.jsonb_build_object(
            'version', migration.version,
            'name', migration.name,
            'statements', migration.statements
          )::text,
          'sha256'
        ), 'hex')
      )
      order by migration.version
    ), '[]'::json)
    from supabase_migrations.schema_migrations as migration
  ),
  'memberBaseline',
  (
    select pg_catalog.json_build_object(
      'count',
      count(*)::bigint,
      'sha256',
      pg_catalog.encode(extensions.digest(coalesce(string_agg(
        member.member_code || ':' || member.id::text,
        ',' order by member.member_code, member.id
      ), ''), 'sha256'), 'hex')
    )
    from public.members as member
  ),
  'authDatabaseInventory',
  pg_catalog.json_build_object(
    'userCount',
    (select count(*)::bigint from auth.users),
    'identityCount',
    (select count(*)::bigint from auth.identities),
    'providers',
    (
      select coalesce(pg_catalog.json_object_agg(provider, provider_count), '{}')
      from (
        select identity.provider, count(*)::bigint as provider_count
        from auth.identities as identity
        group by identity.provider
        order by identity.provider
      ) as provider_counts
    )
  ),
  'tables',
  (
    select coalesce(pg_catalog.json_agg(
      pg_catalog.json_build_object(
        'schema',
        inventory.schema_name,
        'name',
        inventory.table_name,
        'rowCount',
        inventory.row_count,
        'sha256',
        inventory.row_checksum
      )
      order by inventory.schema_name, inventory.table_name
    ), '[]'::json)
    from task8_table_inventory as inventory
  ),
  'storage',
  pg_catalog.json_build_object(
    'buckets',
    (
      select coalesce(pg_catalog.json_agg(
        pg_catalog.json_build_object(
          'id',
          bucket.id,
          'name',
          bucket.name,
          'public',
          bucket.public,
          'fileSizeLimit',
          bucket.file_size_limit,
          'allowedMimeTypes',
          bucket.allowed_mime_types,
          'objectCount',
          (
            select count(*)::bigint
            from storage.objects as object
            where object.bucket_id = bucket.id
          )
        )
        order by bucket.id
      ), '[]'::json)
      from storage.buckets as bucket
    ),
    'totalObjectCount',
    (select count(*)::bigint from storage.objects)
  ),
  'databaseFunctions',
  (
    select coalesce(pg_catalog.json_agg(
      pg_catalog.json_build_object(
        'schema',
        namespace.nspname,
        'name',
        routine.proname,
        'identityArguments',
        pg_catalog.pg_get_function_identity_arguments(routine.oid),
        'sha256',
        pg_catalog.encode(extensions.digest(
          pg_catalog.pg_get_functiondef(routine.oid),
          'sha256'
        ), 'hex')
      )
      order by namespace.nspname, routine.proname,
        pg_catalog.pg_get_function_identity_arguments(routine.oid)
    ), '[]'::json)
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = routine.pronamespace
    where namespace.nspname in ('public', 'match')
      and (
        namespace.nspname = 'match'
        or routine.proname like '%match%'
        or routine.proname in (
          'apply_game_day_command',
          'apply_admin_command',
          'request_member_link',
          'consume_member_link_edge_rate',
          'get_member_read'
        )
      )
  )
)::text;

\ir task8_assert_identity.sql
commit;
