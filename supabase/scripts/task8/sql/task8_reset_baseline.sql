\set ON_ERROR_STOP on
\set QUIET on

begin;
\ir task8_assert_identity.sql

select format(
  'alter database %I reset app.match_member_baseline_count',
  current_database()
)
\gexec

select format(
  'alter database %I reset app.match_member_baseline_sha256',
  current_database()
)
\gexec

\ir task8_assert_identity.sql
commit;

\connect postgres postgres
\ir task8_assert_identity.sql

do $verify$
begin
  if current_setting('app.match_member_baseline_count', true) is not null
     or current_setting('app.match_member_baseline_sha256', true) is not null
  then
    raise exception 'match baseline settings remain after cleanup';
  end if;
end;
$verify$;
