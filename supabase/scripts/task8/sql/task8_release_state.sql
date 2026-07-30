\set ON_ERROR_STOP on
\set QUIET on

select pg_catalog.set_config(
  'task8.release_enabled',
  :'task8_release_enabled',
  false
);

begin;
\ir task8_assert_identity.sql

create temporary table task8_domain_baseline (
  table_name text primary key,
  row_count bigint not null,
  row_checksum text not null
) on commit drop;

do $capture$
declare
  table_row record;
  row_count bigint;
  row_checksum text;
begin
  for table_row in
    select tablename
    from pg_catalog.pg_tables
    where schemaname = 'match'
      and tablename <> 'release_state'
    order by tablename
  loop
    execute format(
      $query$
        select count(*)::bigint,
               encode(extensions.digest(coalesce(string_agg(
                 to_jsonb(domain_row)::text,
                 E'\n' order by to_jsonb(domain_row)::text
               ), ''), 'sha256'), 'hex')
        from match.%I as domain_row
      $query$,
      table_row.tablename
    )
    into row_count, row_checksum;
    insert into task8_domain_baseline values (
      table_row.tablename,
      row_count,
      row_checksum
    );
  end loop;
end;
$capture$;

update match.release_state
set
  traffic_enabled = :'task8_release_enabled'::boolean,
  enabled_at = case
    when :'task8_release_enabled'::boolean
    then coalesce(enabled_at, pg_catalog.clock_timestamp())
    else enabled_at
  end
where singleton;

do $postcondition$
declare
  table_row record;
  actual_count bigint;
  actual_checksum text;
begin
  if (
    select traffic_enabled
    from match.release_state
    where singleton
  ) is distinct from
    pg_catalog.current_setting('task8.release_enabled')::boolean then
    raise exception 'release state postcondition failed';
  end if;

  for table_row in
    select *
    from task8_domain_baseline
    order by table_name
  loop
    execute format(
      $query$
        select count(*)::bigint,
               encode(extensions.digest(coalesce(string_agg(
                 to_jsonb(domain_row)::text,
                 E'\n' order by to_jsonb(domain_row)::text
               ), ''), 'sha256'), 'hex')
        from match.%I as domain_row
      $query$,
      table_row.table_name
    )
    into actual_count, actual_checksum;
    if actual_count <> table_row.row_count
       or actual_checksum <> table_row.row_checksum then
      raise exception 'release toggle changed domain table %',
        table_row.table_name;
    end if;
  end loop;
end;
$postcondition$;

\ir task8_assert_identity.sql
commit;
