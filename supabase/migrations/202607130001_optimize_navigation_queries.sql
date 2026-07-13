create or replace function public.get_current_operator_context()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'id', profiles.id,
    'display_name', profiles.display_name,
    'email', profiles.email,
    'role_label', roles.label,
    'position_label', club_positions.label,
    'permissions', coalesce(
      (
        select jsonb_agg(role_permissions.permission order by role_permissions.permission)
        from public.role_permissions
        where role_permissions.role_id = profiles.role_id
      ),
      '[]'::jsonb
    )
  )
  from public.profiles
  inner join public.roles on roles.id = profiles.role_id
  left join public.club_positions on club_positions.id = profiles.club_position_id
  where profiles.id = auth.uid()
    and profiles.status = 'active';
$$;

revoke execute on function public.get_current_operator_context() from public, anon;
grant execute on function public.get_current_operator_context() to authenticated;

create or replace function public.get_member_directory_page(
  requested_status text default 'active',
  search_query text default null
)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  with operator_permissions as (
    select role_permissions.permission
    from public.profiles
    inner join public.role_permissions
      on role_permissions.role_id = profiles.role_id
    where profiles.id = auth.uid()
      and profiles.status = 'active'
  ), access as (
    select
      exists (select 1 from operator_permissions where permission = 'members.view') as can_view,
      exists (select 1 from operator_permissions where permission = 'members.create') as can_create,
      exists (select 1 from operator_permissions where permission = 'members.update') as can_update,
      exists (select 1 from operator_permissions where permission = 'members.contacts.manage') as can_manage_contacts
  )
  select jsonb_build_object(
    'can_create', access.can_create,
    'can_update', access.can_update,
    'members', case when access.can_view then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', members.id,
        'member_code', members.member_code,
        'name', members.name,
        'operator_profile_id', members.operator_profile_id,
        'club_position_label', club_positions.label,
        'phone_display', case when access.can_manage_contacts
          then member_contacts.phone_number
          else public.mask_phone_number(member_contacts.phone_number)
        end,
        'group_code', member_groups.code,
        'status', members.status,
        'joined_date', members.joined_date,
        'withdrawn_date', members.withdrawn_date,
        'memo', members.memo
      ) order by members.member_code)
      from public.members
      left join public.member_groups on member_groups.id = members.group_id
      left join public.member_contacts on member_contacts.member_id = members.id
      left join public.profiles operator_profiles on operator_profiles.id = members.operator_profile_id
      left join public.club_positions on club_positions.id = operator_profiles.club_position_id
      where (requested_status is null or members.status::text = requested_status)
        and (nullif(btrim(search_query), '') is null
          or members.name ilike '%' || btrim(search_query) || '%'
          or members.member_code ilike '%' || btrim(search_query) || '%')
    ), '[]'::jsonb) else '[]'::jsonb end
  )
  from access;
$$;

revoke execute on function public.get_member_directory_page(text, text) from public, anon;
grant execute on function public.get_member_directory_page(text, text) to authenticated;
