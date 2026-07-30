\set ON_ERROR_STOP on
\set QUIET on

\ir task8_assert_identity.sql

do $capability$
declare
  capability task8_rollout.telemetry_capability%rowtype;
begin
  select *
  into strict capability
  from task8_rollout.telemetry_capability
  where singleton;

  if capability.source_name <> 'instrumented_lock_acquisition'
     or capability.resolution_ms > 10
     or to_regprocedure(
       'task8_rollout.export_lock_wait_ms(timestamp with time zone,timestamp with time zone)'
     ) is null then
    raise exception 'reliable lock_wait_ms capability is unavailable';
  end if;
exception
  when no_data_found then
    raise exception 'reliable lock_wait_ms capability is unavailable';
end;
$capability$;

select pg_catalog.json_build_object(
  'source',
  capability.source_name,
  'resolutionMs',
  capability.resolution_ms,
  'verifiedAt',
  capability.verified_at,
  'approvalId',
  capability.approval_id
)::text
from task8_rollout.telemetry_capability as capability
where capability.singleton;
