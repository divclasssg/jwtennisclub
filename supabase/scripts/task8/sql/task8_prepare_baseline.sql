\set ON_ERROR_STOP on
\set QUIET on

begin;
\ir task8_assert_identity.sql

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

\ir task8_assert_identity.sql
commit;

\connect postgres postgres
\ir task8_assert_identity.sql

do $verify$
begin
  if current_setting('app.match_member_baseline_count', true) is null
     or current_setting('app.match_member_baseline_sha256', true) is null then
    raise exception 'match baseline settings are unavailable';
  end if;
end;
$verify$;
