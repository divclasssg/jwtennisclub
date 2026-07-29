\set ON_ERROR_STOP on
\set QUIET on

select format(
  'alter database %I set app.match_member_baseline_count = %L',
  current_database(),
  count(*)::text
)
from public.members
\gexec

select format(
  'alter database %I set app.match_member_baseline_sha256 = %L',
  current_database(),
  encode(
    extensions.digest(
      coalesce(
        string_agg(member_code || ':' || id::text, ',' order by member_code, id),
        ''
      ),
      'sha256'
    ),
    'hex'
  )
)
from public.members
\gexec

\connect postgres postgres

do $$
declare
  expected_count integer;
  expected_sha256 text;
  actual_count integer;
  actual_sha256 text;
begin
  expected_count := nullif(
    current_setting('app.match_member_baseline_count', true),
    ''
  )::integer;
  expected_sha256 := nullif(
    current_setting('app.match_member_baseline_sha256', true),
    ''
  );

  select
    count(*)::integer,
    encode(
      extensions.digest(
        coalesce(
          string_agg(member_code || ':' || id::text, ',' order by member_code, id),
          ''
        ),
        'sha256'
      ),
      'hex'
    )
  into actual_count, actual_sha256
  from public.members;

  if expected_count is null or expected_sha256 is null then
    raise exception 'match baseline settings are not visible to a fresh connection';
  end if;

  if expected_count <> actual_count or expected_sha256 <> actual_sha256 then
    raise exception 'match baseline settings do not match the local fixture';
  end if;
end;
$$;

\echo match baseline settings are visible and verified in a fresh postgres connection
