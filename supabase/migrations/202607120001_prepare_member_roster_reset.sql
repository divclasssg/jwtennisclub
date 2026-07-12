insert into public.role_permissions (role_id, permission)
select roles.id, permissions.permission
from public.roles
cross join (
  values ('members.contacts.manage')
) as permissions(permission)
where roles.name = 'admin'
on conflict (role_id, permission) do nothing;

create table public.member_groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_-]{0,15}$'),
  label text not null check (length(btrim(label)) > 0),
  is_active boolean not null default true
);

insert into public.member_groups (code, label)
values ('A', 'A'), ('B', 'B')
on conflict (code) do nothing;

alter table public.members
  add column member_code text,
  add column group_id uuid references public.member_groups(id) on delete set null;

update public.members
set group_id = (select id from public.member_groups where code = 'A')
where group_id is null;

with numbered_members as (
  select id, row_number() over (order by created_at, id) as member_number
  from public.members
)
update public.members
set member_code = 'A' || lpad(numbered_members.member_number::text, 4, '0')
from numbered_members
where members.id = numbered_members.id;

alter table public.members
  alter column member_code set not null,
  add constraint members_member_code_format
    check (member_code ~ '^[A-Z][0-9]{4}$');

create unique index members_member_code_unique
on public.members(member_code) where member_code is not null;

create table public.member_contacts (
  member_id uuid primary key references public.members(id) on delete cascade,
  phone_number text,
  phone_normalized text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint member_contacts_phone_pair check (
    (phone_number is null and phone_normalized is null)
    or (phone_number is not null and phone_normalized ~ '^01[016789][0-9]{7,8}$')
  )
);

alter table public.member_groups enable row level security;
alter table public.member_contacts enable row level security;

create policy "operators can read member groups"
on public.member_groups for select to authenticated
using (public.has_permission('members.view'));

create policy "contact managers can read member contacts"
on public.member_contacts for select to authenticated
using (public.has_permission('members.contacts.manage'));

grant select on public.member_groups to authenticated;
grant select on public.member_contacts to authenticated;
revoke insert, update, delete on public.member_contacts from anon, authenticated;

create or replace function public.mask_phone_number(phone_number text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when phone_number is null then null
    else left(regexp_replace(phone_number, '[^0-9]', '', 'g'), 3)
      || '-****-'
      || right(regexp_replace(phone_number, '[^0-9]', '', 'g'), 4)
  end;
$$;

revoke execute on function public.mask_phone_number(text) from public, anon;

create or replace function public.get_masked_member_contacts(member_ids uuid[])
returns table(member_id uuid, phone_masked text)
language sql
security definer
set search_path = public
stable
as $$
  select member_contacts.member_id,
         public.mask_phone_number(member_contacts.phone_number)
  from public.member_contacts
  where public.has_permission('members.view')
    and member_contacts.member_id = any(member_ids);
$$;

revoke execute on function public.get_masked_member_contacts(uuid[]) from public, anon;
grant execute on function public.get_masked_member_contacts(uuid[]) to authenticated;

create or replace function public.search_members_by_phone(phone_query text)
returns table(member_id uuid)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  normalized_query text := regexp_replace(coalesce(phone_query, ''), '[^0-9]', '', 'g');
begin
  if not public.has_permission('members.contacts.manage') then
    raise exception 'members.contacts.manage permission required';
  end if;

  if normalized_query !~ '^01[016789][0-9]{7,8}$' then
    return;
  end if;

  return query
  select member_contacts.member_id
  from public.member_contacts
  where member_contacts.phone_normalized = normalized_query;
end;
$$;

revoke execute on function public.search_members_by_phone(text) from public, anon;
grant execute on function public.search_members_by_phone(text) to authenticated;

create or replace function public.next_member_code(requested_group_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  group_code text;
  next_number integer;
begin
  perform pg_advisory_xact_lock(hashtext('public.members.member_code'));

  select member_groups.code into group_code
  from public.member_groups
  where member_groups.id = requested_group_id
    and member_groups.is_active;

  if group_code is null or group_code !~ '^[A-Z]$' then
    raise exception 'an active single-letter member group is required';
  end if;

  select coalesce(max(right(members.member_code, 4)::integer), 0) + 1
  into next_number
  from public.members
  where members.member_code is not null;

  if next_number > 9999 then
    raise exception 'member code sequence exhausted';
  end if;

  return group_code || lpad(next_number::text, 4, '0');
end;
$$;

revoke execute on function public.next_member_code(uuid) from public, anon, authenticated;

create or replace function public.assign_member_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.group_id is null then
    select id into new.group_id from public.member_groups where code = 'A' and is_active;
  end if;

  if auth.role() = 'service_role'
     and current_setting('app.member_roster_reset_import', true) = 'on' then
    if new.member_code is null or new.member_code !~ '^[A-Z][0-9]{4}$' then
      raise exception 'invalid imported member code';
    end if;
  else
    new.member_code := public.next_member_code(new.group_id);
  end if;
  return new;
end;
$$;

revoke execute on function public.assign_member_code() from public, anon, authenticated;

create trigger members_assign_member_code
before insert on public.members
for each row
execute function public.assign_member_code();

create or replace function public.prevent_member_code_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.member_code is distinct from new.member_code then
    raise exception 'member_code cannot be changed';
  end if;
  return new;
end;
$$;

revoke execute on function public.prevent_member_code_change() from public, anon, authenticated;

create trigger members_prevent_member_code_change
before update of member_code on public.members
for each row
execute function public.prevent_member_code_change();

create or replace function public.save_member_with_contact(
  member_id uuid,
  member_data jsonb,
  duplicate_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_member_id uuid := member_id;
  requested_name text := btrim(member_data->>'name');
  requested_phone text := nullif(btrim(member_data->>'phone_number'), '');
  normalized_phone text;
  duplicate_id uuid;
  name_exists boolean;
  assigned_code text;
  contact_update_requested boolean := member_data ? 'phone_number';
begin
  if member_id is null and not public.has_permission('members.create') then
    raise exception 'members.create permission required';
  elsif member_id is not null and not public.has_permission('members.update') then
    raise exception 'members.update permission required';
  end if;

  if (member_id is null or contact_update_requested)
     and not public.has_permission('members.contacts.manage') then
    raise exception 'members.contacts.manage permission required';
  end if;

  if requested_name is null or requested_name = '' then
    raise exception 'member name is required';
  end if;

  normalized_phone := nullif(regexp_replace(coalesce(requested_phone, ''), '[^0-9]', '', 'g'), '');
  if normalized_phone is not null and normalized_phone !~ '^01[016789][0-9]{7,8}$' then
    raise exception 'invalid phone number';
  end if;

  if contact_update_requested then
    perform pg_advisory_xact_lock(
      hashtextextended('member-contact-phone:' || coalesce(normalized_phone, '<none>'), 0)
    );
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('member-contact-name:' || lower(requested_name), 0)
  );

  if contact_update_requested then
    select contacts.member_id into duplicate_id
    from public.member_contacts contacts
    join public.members duplicate_member on duplicate_member.id = contacts.member_id
    where contacts.phone_normalized = normalized_phone
      and contacts.member_id is distinct from member_id
    order by (lower(btrim(duplicate_member.name)) = lower(requested_name)) desc
    limit 1;
  end if;

  if duplicate_id is not null then
    if exists (
      select 1 from public.members
      where id = duplicate_id and lower(btrim(name)) = lower(requested_name)
    ) then
      return jsonb_build_object('status', 'DUPLICATE_BLOCKED', 'member_id', duplicate_id);
    elsif duplicate_confirmation is distinct from 'CONFIRM_PHONE_REUSE' then
      return jsonb_build_object('status', 'PHONE_REUSE_CONFIRMATION_REQUIRED', 'member_id', duplicate_id);
    end if;
  end if;

  select exists (
    select 1 from public.members
    where id is distinct from member_id
      and lower(btrim(name)) = lower(requested_name)
  ) into name_exists;

  if contact_update_requested and normalized_phone is null and name_exists
     and duplicate_confirmation is distinct from 'CONFIRM_NAME_ONLY' then
    return jsonb_build_object('status', 'NAME_ONLY_CONFIRMATION_REQUIRED');
  end if;

  if saved_member_id is null then
    insert into public.members (
      name, phone_last_four, status, joined_date, withdrawn_date,
      withdrawal_reason, memo, created_by, updated_by, group_id
    ) values (
      requested_name, right(normalized_phone, 4),
      coalesce((member_data->>'status')::public.member_status, 'active'),
      coalesce((member_data->>'joined_date')::date, current_date),
      (member_data->>'withdrawn_date')::date,
      nullif(btrim(member_data->>'withdrawal_reason'), ''),
      nullif(btrim(member_data->>'memo'), ''), auth.uid(), auth.uid(),
      (member_data->>'group_id')::uuid
    ) returning id into saved_member_id;
  else
    update public.members set
      name = requested_name,
      phone_last_four = case when contact_update_requested then right(normalized_phone, 4) else phone_last_four end,
      status = coalesce((member_data->>'status')::public.member_status, status),
      joined_date = coalesce((member_data->>'joined_date')::date, joined_date),
      withdrawn_date = (member_data->>'withdrawn_date')::date,
      withdrawal_reason = nullif(btrim(member_data->>'withdrawal_reason'), ''),
      memo = nullif(btrim(member_data->>'memo'), ''),
      group_id = case
        when member_data ? 'group_id' then (member_data->>'group_id')::uuid
        else group_id
      end,
      updated_by = auth.uid(), updated_at = now()
    where id = saved_member_id;

    if not found then
      raise exception 'member not found';
    end if;
  end if;

  if contact_update_requested then
    if requested_phone is not null then
      insert into public.member_contacts (
        member_id, phone_number, phone_normalized, updated_by, updated_at
      ) values (
        saved_member_id, requested_phone, normalized_phone, auth.uid(), now()
      ) on conflict (member_id) do update set
        phone_number = excluded.phone_number,
        phone_normalized = excluded.phone_normalized,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
    else
      delete from public.member_contacts where member_contacts.member_id = saved_member_id;
    end if;
  end if;

  return jsonb_build_object(
    'status', 'SAVED', 'member_id', saved_member_id,
    'member_code', coalesce(assigned_code, (select member_code from public.members where id = saved_member_id))
  );
end;
$$;

revoke execute on function public.save_member_with_contact(uuid, jsonb, text) from public, anon;
grant execute on function public.save_member_with_contact(uuid, jsonb, text) to authenticated;

create or replace function public.admin_reset_member_roster(
  import_rows jsonb,
  confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  imported_count integer;
  preserved_profile_count integer;
  reconnected_profile_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role required';
  end if;

  if confirmation is distinct from 'RESET_MEMBERS_AND_FEES' then
    raise exception 'invalid reset confirmation';
  end if;

  if jsonb_typeof(import_rows) is distinct from 'array' then
    raise exception 'import_rows must be a JSON array';
  end if;

  create temporary table roster_profile_links on commit drop as
  select id as old_member_id, operator_profile_id,
         lower(btrim(normalize(name, NFKC))) as normalized_name,
         null::uuid as matched_member_id
  from public.members
  where operator_profile_id is not null;

  create temporary table roster_import_rows on commit drop as
  select
    coalesce(row.id, gen_random_uuid()) as id,
    row.name, row.status, row.joined_date, row.withdrawn_date,
    row.withdrawal_reason, row.memo, row.member_code, row.group_code,
    row.phone_number,
    lower(btrim(normalize(row.name, NFKC))) as normalized_name,
    nullif(regexp_replace(coalesce(row.phone_number, ''), '[^0-9]', '', 'g'), '') as normalized_phone
  from jsonb_to_recordset(import_rows) as row(
    id uuid, name text, status text, joined_date date, withdrawn_date date,
    withdrawal_reason text, memo text, member_code text, group_code text,
    phone_number text
  );

  if exists (
    select 1
    from roster_import_rows row
    left join public.member_groups groups
      on groups.code = row.group_code and groups.is_active
    where row.group_code is not null and groups.id is null
  ) or not exists (
    select 1 from public.member_groups groups
    where groups.code = 'A' and groups.is_active
      and exists (select 1 from roster_import_rows row where row.group_code is null)
  ) and exists (
    select 1 from roster_import_rows row where row.group_code is null
  ) then
    raise exception 'invalid imported group';
  end if;

  if exists (
    select 1 from roster_import_rows row
    where nullif(btrim(row.name), '') is null
      or row.member_code is null
      or row.status is null
      or row.joined_date is null
  ) then
    raise exception 'imported member fields are required';
  end if;

  if exists (
    select 1 from roster_import_rows row
    where row.member_code !~ '^[A-Z][0-9]{4}$'
  ) then
    raise exception 'invalid imported member code';
  end if;

  if (select count(distinct left(row.member_code, 1)) from roster_import_rows row) <> 1 then
    raise exception 'imported member code prefixes must match';
  end if;

  if exists (
    select row.member_code from roster_import_rows row
    group by row.member_code having count(*) > 1
  ) then
    raise exception 'duplicate imported member code';
  end if;

  if exists (
    select 1 from roster_import_rows row
    where row.status not in ('active', 'paused', 'withdrawn')
      or (row.phone_number is not null and btrim(row.phone_number) !~ '^[0-9 ()-]+$')
      or (row.normalized_phone is not null and row.normalized_phone !~ '^01[016789][0-9]{7,8}$')
  ) then
    raise exception 'invalid imported member values';
  end if;

  if exists (
    select row.normalized_name, row.normalized_phone
    from roster_import_rows row
    where row.normalized_phone is not null
    group by row.normalized_name, row.normalized_phone
    having count(*) > 1
  ) then
    raise exception 'duplicate imported name and phone';
  end if;

  if exists (
    select 1
    from roster_profile_links links
    join roster_import_rows imported on imported.id = links.old_member_id
    where imported.normalized_name is distinct from links.normalized_name
  ) then
    raise exception 'operator profile member UUID/name mismatch';
  end if;

  if exists (
    select 1
    from roster_profile_links links
    where (
      select count(*)
      from roster_import_rows imported
      where imported.normalized_name = links.normalized_name
    ) <> 1
    or 1 <> (
      select count(*)
      from roster_profile_links same_name_link
      where same_name_link.normalized_name = links.normalized_name
    )
  ) then
    raise exception 'operator profile must match exactly one imported member';
  end if;

  update roster_profile_links links
  set matched_member_id = imported.id
  from roster_import_rows imported
  where imported.normalized_name = links.normalized_name;

  perform pg_advisory_xact_lock(hashtext('public.members.member_code'));
  delete from public.fee_payments;
  delete from public.members;
  perform set_config('app.member_roster_reset_import', 'on', true);

  insert into public.members (
    id, name, member_code, status, joined_date, withdrawn_date, withdrawal_reason, memo,
    group_id, created_at, updated_at
  )
  select
    row.id, btrim(row.name), row.member_code,
    coalesce(row.status, 'active')::public.member_status,
    coalesce(row.joined_date, current_date), row.withdrawn_date,
    nullif(btrim(row.withdrawal_reason), ''), nullif(btrim(row.memo), ''),
    coalesce(groups.id, default_group.id), now(), now()
  from roster_import_rows row
  left join public.member_groups groups on groups.code = row.group_code
  cross join lateral (
    select id from public.member_groups where code = 'A' and is_active
  ) default_group;

  insert into public.member_contacts (member_id, phone_number, phone_normalized)
  select members.id, row.phone_number,
         regexp_replace(row.phone_number, '[^0-9]', '', 'g')
  from roster_import_rows row
  join public.members members on members.id = row.id
  where nullif(btrim(row.phone_number), '') is not null;

  update public.members
  set operator_profile_id = links.operator_profile_id
  from roster_profile_links links
  where members.id = links.matched_member_id;

  get diagnostics reconnected_profile_count = row_count;
  select count(*) into preserved_profile_count from roster_profile_links;

  if reconnected_profile_count <> preserved_profile_count then
    raise exception 'operator profile reconnect count mismatch';
  end if;

  select count(*) into imported_count from public.members;

  return jsonb_build_object(
    'status', 'RESET_COMPLETE',
    'imported_count', imported_count,
    'reconnected_profile_count', reconnected_profile_count
  );
end;
$$;

revoke execute on function public.admin_reset_member_roster(jsonb, text)
from public, anon, authenticated;
grant execute on function public.admin_reset_member_roster(jsonb, text) to service_role;
