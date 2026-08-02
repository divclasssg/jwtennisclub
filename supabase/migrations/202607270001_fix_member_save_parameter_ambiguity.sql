begin;

create or replace function public.save_member_with_contact(
  member_id uuid,
  member_data jsonb,
  duplicate_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_member_id uuid := save_member_with_contact.member_id;
  requested_name text := pg_catalog.btrim(member_data->>'name');
  normalized_name text := pg_catalog.lower(
    pg_catalog.btrim(normalize(member_data->>'name', NFKC))
  );
  requested_phone text := nullif(
    pg_catalog.btrim(member_data->>'phone_number'),
    ''
  );
  normalized_phone text;
  duplicate_id uuid;
  name_exists boolean;
  assigned_code text;
  contact_update_requested boolean := member_data ? 'phone_number';
  kst_today date := public.meeting_kst_today();
begin
  if save_member_with_contact.member_id is null
    and not public.has_permission('members.create')
  then
    raise exception 'members.create permission required';
  elsif save_member_with_contact.member_id is not null
    and not public.has_permission('members.update')
  then
    raise exception 'members.update permission required';
  end if;

  if contact_update_requested
     and not public.has_permission('members.contacts.manage') then
    raise exception 'members.contacts.manage permission required';
  end if;

  if requested_name is null or requested_name = '' then
    raise exception 'member name is required';
  end if;

  normalized_phone := nullif(
    pg_catalog.regexp_replace(
      coalesce(requested_phone, ''),
      '[^0-9]',
      '',
      'g'
    ),
    ''
  );
  if normalized_phone is not null
    and normalized_phone !~ '^01[016789][0-9]{7,8}$'
  then
    raise exception 'invalid phone number';
  end if;

  perform public.prepare_meeting_rosters_before_member_change(
    kst_today,
    auth.uid()
  );

  if contact_update_requested then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'member-contact-phone:'
          || coalesce(normalized_phone, '<none>'),
        0
      )
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('member-contact-name:' || normalized_name, 0)
  );

  if contact_update_requested then
    select contacts.member_id
    into duplicate_id
    from public.member_contacts as contacts
    inner join public.members as duplicate_member
      on duplicate_member.id = contacts.member_id
    where contacts.phone_normalized = normalized_phone
      and contacts.member_id is distinct from
        save_member_with_contact.member_id
    order by (
      pg_catalog.lower(
        pg_catalog.btrim(normalize(duplicate_member.name, NFKC))
      ) = normalized_name
    ) desc
    limit 1;
  end if;

  if duplicate_id is not null then
    if exists (
      select 1
      from public.members as duplicate_member
      where duplicate_member.id = duplicate_id
        and pg_catalog.lower(
          pg_catalog.btrim(normalize(duplicate_member.name, NFKC))
        ) = normalized_name
    ) then
      return pg_catalog.jsonb_build_object(
        'status',
        'DUPLICATE_BLOCKED',
        'member_id',
        duplicate_id
      );
    elsif duplicate_confirmation is distinct from 'CONFIRM_PHONE_REUSE' then
      return pg_catalog.jsonb_build_object(
        'status',
        'PHONE_REUSE_CONFIRMATION_REQUIRED',
        'member_id',
        duplicate_id
      );
    end if;
  end if;

  select exists (
    select 1
    from public.members as existing_members
    where existing_members.id is distinct from
        save_member_with_contact.member_id
      and pg_catalog.lower(
        pg_catalog.btrim(normalize(existing_members.name, NFKC))
      ) = normalized_name
  )
  into name_exists;

  if save_member_with_contact.member_id is null
    and normalized_phone is null
    and name_exists
    and duplicate_confirmation is distinct from 'CONFIRM_NAME_ONLY'
  then
    return pg_catalog.jsonb_build_object(
      'status',
      'NAME_ONLY_CONFIRMATION_REQUIRED'
    );
  end if;

  if saved_member_id is null then
    insert into public.members (
      name,
      status,
      joined_date,
      withdrawn_date,
      memo,
      created_by,
      updated_by,
      group_id
    )
    values (
      requested_name,
      coalesce(
        (member_data->>'status')::public.member_status,
        'active'
      ),
      coalesce((member_data->>'joined_date')::date, kst_today),
      (member_data->>'withdrawn_date')::date,
      nullif(pg_catalog.btrim(member_data->>'memo'), ''),
      auth.uid(),
      auth.uid(),
      (member_data->>'group_id')::uuid
    )
    returning id into saved_member_id;
  else
    update public.members as saved_members
    set name = requested_name,
        status = coalesce(
          (member_data->>'status')::public.member_status,
          saved_members.status
        ),
        joined_date = coalesce(
          (member_data->>'joined_date')::date,
          saved_members.joined_date
        ),
        withdrawn_date = (member_data->>'withdrawn_date')::date,
        memo = nullif(pg_catalog.btrim(member_data->>'memo'), ''),
        group_id = case
          when member_data ? 'group_id'
            then (member_data->>'group_id')::uuid
          else saved_members.group_id
        end,
        updated_by = auth.uid(),
        updated_at = pg_catalog.now()
    where saved_members.id = saved_member_id;

    if not found then
      raise exception 'member not found';
    end if;
  end if;

  if contact_update_requested then
    if requested_phone is not null then
      insert into public.member_contacts (
        member_id,
        phone_number,
        phone_normalized,
        updated_by,
        updated_at
      )
      values (
        saved_member_id,
        normalized_phone,
        normalized_phone,
        auth.uid(),
        pg_catalog.now()
      )
      on conflict on constraint member_contacts_pkey do update
      set phone_number = excluded.phone_number,
          phone_normalized = excluded.phone_normalized,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at;
    else
      delete from public.member_contacts as member_contacts
      where member_contacts.member_id = saved_member_id;
    end if;
  end if;

  perform public.sync_meeting_rosters_after_member_change(kst_today);

  return pg_catalog.jsonb_build_object(
    'status',
    'SAVED',
    'member_id',
    saved_member_id,
    'member_code',
    coalesce(
      assigned_code,
      (
        select members.member_code
        from public.members as members
        where members.id = saved_member_id
      )
    )
  );
end;
$$;

revoke execute on function public.save_member_with_contact(uuid, jsonb, text)
from public, anon;
grant execute on function public.save_member_with_contact(uuid, jsonb, text)
to authenticated;

commit;
