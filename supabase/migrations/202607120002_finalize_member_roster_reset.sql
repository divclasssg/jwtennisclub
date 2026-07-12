-- Global transaction lock order shared with profile-trigger and roster-reset writes.
-- SHARE locks block authorization-changing writes until this migration commits.
lock table public.profiles in share mode;
lock table public.member_code_allocator in share mode;
lock table public.members in share mode;
lock table public.fee_payments in share mode;
lock table public.expenses in share mode;
lock table public.events in share mode;
lock table public.audit_logs in share mode;

do $$
begin
  if not exists (select 1 from public.member_roster_reset_state where singleton)
     and not exists (select 1 from public.members)
     and not exists (select 1 from public.profiles)
     and not exists (select 1 from public.fee_payments)
     and not exists (select 1 from public.expenses)
     and not exists (select 1 from public.events)
     and not exists (select 1 from public.audit_logs) then
    insert into public.member_roster_reset_state (singleton, marker_kind, member_count, marked_at)
    values (true, 'bootstrap_empty', 0, now());
  end if;

  if not exists (
       select 1
       from public.member_roster_reset_state
       where singleton
         and marker_kind in ('reset_complete', 'bootstrap_empty')
         and (
           (marker_kind = 'reset_complete'
             and member_count > 0
             and member_count = (select count(*) from public.members))
           or (marker_kind = 'bootstrap_empty' and member_count = 0 and not exists (select 1 from public.members))
         )
     ) then
    raise exception 'member roster reset has not been completed; do not finalize the roster migration';
  end if;
end;
$$;

alter table public.members
  alter column member_code set not null;

drop index if exists public.members_member_code_unique;

create unique index members_member_code_unique
on public.members(member_code);

do $$
begin
  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.members'::regclass
      and attname = 'member_code'
      and not attisdropped
      and attnotnull
  ) then
    raise exception 'members.member_code must be NOT NULL before roster finalization';
  end if;

  if exists (
    select 1 from public.members
    where member_code !~ '^[A-Z][0-9]{4}$'
  ) then
    raise exception 'members.member_code contains invalid values';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.members'::regclass
      and conname = 'members_member_code_format'
      and contype = 'c'
      and convalidated
      and pg_get_constraintdef(oid) like '%^[A-Z][0-9]{4}$%'
  ) then
    raise exception 'members_member_code_format must be present and validated';
  end if;

  if not exists (
    select 1
    from pg_class indexes
    join pg_index index_metadata on index_metadata.indexrelid = indexes.oid
    join pg_attribute member_code_attribute
      on member_code_attribute.attrelid = index_metadata.indrelid
     and member_code_attribute.attname = 'member_code'
    where indexes.oid = to_regclass('public.members_member_code_unique')
      and index_metadata.indrelid = 'public.members'::regclass
      and index_metadata.indisunique
      and index_metadata.indisvalid
      and index_metadata.indisready
      and index_metadata.indnkeyatts = 1
      and index_metadata.indexprs is null
      and index_metadata.indpred is null
      and index_metadata.indkey::smallint[] = array[member_code_attribute.attnum]::smallint[]
  ) then
    raise exception 'members_member_code_unique must be a valid unique index';
  end if;

  if not exists (
    select 1
    from pg_trigger triggers
    join pg_proc functions on functions.oid = triggers.tgfoid
    join pg_namespace schemas on schemas.oid = functions.pronamespace
    where triggers.tgrelid = 'public.members'::regclass
      and triggers.tgname = 'members_prevent_member_code_change'
      and not triggers.tgisinternal
      and triggers.tgenabled <> 'D'
      and (triggers.tgtype::integer & 1) = 1
      and (triggers.tgtype::integer & 2) = 2
      and (triggers.tgtype::integer & 16) = 16
      and schemas.nspname = 'public'
      and functions.proname = 'prevent_member_code_change'
      and triggers.tgfoid = 'public.prevent_member_code_change()'::regprocedure
  ) then
    raise exception 'members_prevent_member_code_change must enforce immutable member codes';
  end if;
end;
$$;

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
  normalized_name text := lower(btrim(normalize(member_data->>'name', NFKC)));
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

  if contact_update_requested
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
    hashtextextended('member-contact-name:' || normalized_name, 0)
  );

  if contact_update_requested then
    select contacts.member_id into duplicate_id
    from public.member_contacts contacts
    join public.members duplicate_member on duplicate_member.id = contacts.member_id
    where contacts.phone_normalized = normalized_phone
      and contacts.member_id is distinct from member_id
    order by (lower(btrim(normalize(duplicate_member.name, NFKC))) = normalized_name) desc
    limit 1;
  end if;

  if duplicate_id is not null then
    if exists (
      select 1 from public.members
      where id = duplicate_id and lower(btrim(normalize(name, NFKC))) = normalized_name
    ) then
      return jsonb_build_object('status', 'DUPLICATE_BLOCKED', 'member_id', duplicate_id);
    elsif duplicate_confirmation is distinct from 'CONFIRM_PHONE_REUSE' then
      return jsonb_build_object('status', 'PHONE_REUSE_CONFIRMATION_REQUIRED', 'member_id', duplicate_id);
    end if;
  end if;

  select exists (
    select 1 from public.members
    where id is distinct from member_id
      and lower(btrim(normalize(name, NFKC))) = normalized_name
  ) into name_exists;

  if member_id is null and normalized_phone is null and name_exists
     and duplicate_confirmation is distinct from 'CONFIRM_NAME_ONLY' then
    return jsonb_build_object('status', 'NAME_ONLY_CONFIRMATION_REQUIRED');
  end if;

  if saved_member_id is null then
    insert into public.members (
      name, status, joined_date, withdrawn_date, memo,
      created_by, updated_by, group_id
    ) values (
      requested_name,
      coalesce((member_data->>'status')::public.member_status, 'active'),
      coalesce((member_data->>'joined_date')::date, current_date),
      (member_data->>'withdrawn_date')::date,
      nullif(btrim(member_data->>'memo'), ''), auth.uid(), auth.uid(),
      (member_data->>'group_id')::uuid
    ) returning id into saved_member_id;
  else
    update public.members set
      name = requested_name,
      status = coalesce((member_data->>'status')::public.member_status, status),
      joined_date = coalesce((member_data->>'joined_date')::date, joined_date),
      withdrawn_date = (member_data->>'withdrawn_date')::date,
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
        saved_member_id, normalized_phone, normalized_phone, auth.uid(), now()
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

alter table public.members
  drop constraint if exists members_phone_last_four_digits,
  drop constraint if exists members_withdrawal_reason_not_blank,
  drop constraint if exists members_withdrawal_reason_matches_status,
  drop column if exists phone_last_four,
  drop column if exists withdrawal_reason;

revoke execute on function public.admin_reset_member_roster(jsonb, text, uuid[])
from public, anon, authenticated, service_role;
drop function public.admin_reset_member_roster(jsonb, text, uuid[]);

drop table public.member_roster_reset_state;
