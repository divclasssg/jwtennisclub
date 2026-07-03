create table public.club_positions (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    label text not null,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

insert into public.club_positions (name, label, sort_order)
values
    ('president', '회장', 10),
    ('match_director', '경기이사', 20),
    ('treasurer', '총무', 30),
    ('assistant_treasurer', '부총무', 40)
on conflict (name) do update
set
    label = excluded.label,
    sort_order = excluded.sort_order;

alter table public.profiles
add column if not exists club_position_id uuid references public.club_positions(id);

create index if not exists profiles_club_position_id_idx
on public.profiles(club_position_id);

alter table public.club_positions enable row level security;

create policy "authenticated operators can read club positions"
on public.club_positions for select
to authenticated
using (public.is_active_operator());
