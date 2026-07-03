insert into public.role_permissions (role_id, permission)
select roles.id, permissions.permission
from public.roles
cross join (
  values
    ('events.view'),
    ('events.create'),
    ('events.update'),
    ('events.delete')
) as permissions(permission)
where roles.name in ('admin', 'operator')
on conflict (role_id, permission) do nothing;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  event_time time not null,
  title text not null,
  location text not null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_title_not_blank check (length(btrim(title)) > 0),
  constraint events_location_not_blank check (length(btrim(location)) > 0)
);

create index if not exists events_event_date_time_idx
on public.events(event_date, event_time);

alter table public.events enable row level security;

drop policy if exists "operators with event view permission can read events"
on public.events;

create policy "operators with event view permission can read events"
on public.events for select
to authenticated
using (public.has_permission('events.view'));

drop policy if exists "operators with event create permission can create events"
on public.events;

create policy "operators with event create permission can create events"
on public.events for insert
to authenticated
with check (
  public.has_permission('events.create')
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

drop policy if exists "operators with event update permission can update events"
on public.events;

create policy "operators with event update permission can update events"
on public.events for update
to authenticated
using (public.has_permission('events.update'))
with check (
  public.has_permission('events.update')
  and updated_by = auth.uid()
);

drop policy if exists "operators with event delete permission can delete events"
on public.events;

create policy "operators with event delete permission can delete events"
on public.events for delete
to authenticated
using (public.has_permission('events.delete'));
