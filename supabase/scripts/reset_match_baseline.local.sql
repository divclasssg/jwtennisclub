\set ON_ERROR_STOP on
\set QUIET on

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

\connect postgres postgres

do $$
begin
  if current_setting('app.match_member_baseline_count', true) is not null
     or current_setting('app.match_member_baseline_sha256', true) is not null then
    raise exception 'match baseline settings remain visible after cleanup';
  end if;
end;
$$;

\echo match baseline settings are absent in a fresh postgres connection
