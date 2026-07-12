do $$
declare
  function_definition text;
  patched_definition text;
begin
  select pg_get_functiondef(
    'public.admin_reset_member_roster(jsonb,text,uuid[])'::regprocedure
  ) into function_definition;

  patched_definition := replace(
    function_definition,
    'delete from public.fee_payments;',
    'delete from public.fee_payments where true;'
  );

  if patched_definition = function_definition then
    raise exception 'fee payment reset delete was not found';
  end if;

  function_definition := patched_definition;
  patched_definition := replace(
    function_definition,
    'delete from public.members;',
    'delete from public.members where true;'
  );

  if patched_definition = function_definition then
    raise exception 'member reset delete was not found';
  end if;

  execute patched_definition;
end;
$$;
