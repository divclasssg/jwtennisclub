select public.match_assert_integration_preconditions();

create schema match;

create type match.gender_type as enum ('female', 'male', 'unspecified');
create type match.game_day_status as enum ('draft', 'active', 'completed');
create type match.match_status as enum (
  'suggested',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled'
);
create type match.link_status as enum ('pending', 'approved', 'rejected');
create type match.change_source as enum ('online', 'offline');

create table match.grades (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  strength integer not null unique check (strength > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table match.member_profiles (
  member_id uuid primary key
    references public.members(id) on delete restrict,
  public_alias text not null unique check (length(btrim(public_alias)) > 0),
  gender match.gender_type not null,
  grade_id uuid not null references match.grades(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table match.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  starts_on date not null,
  ends_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create table match.game_days (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references match.seasons(id) on delete restrict,
  played_on date not null,
  status match.game_day_status not null default 'draft',
  active_courts integer not null default 2 check (active_courts between 1 and 2),
  version integer not null default 1 check (version > 0),
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (season_id, played_on),
  check ((status = 'completed') = (completed_at is not null))
);

create table match.attendances (
  id uuid primary key default gen_random_uuid(),
  game_day_id uuid not null references match.game_days(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  checked_in boolean not null default true,
  checked_in_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (game_day_id, member_id)
);

create table match.matches (
  id uuid primary key default gen_random_uuid(),
  game_day_id uuid not null references match.game_days(id) on delete cascade,
  court_number integer not null check (court_number between 1 and 2),
  status match.match_status not null default 'suggested',
  winner_team integer check (winner_team in (1, 2)),
  version integer not null default 1 check (version > 0),
  suggested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  check ((status = 'completed') = (winner_team is not null)),
  check ((status = 'completed') = (completed_at is not null))
);

create table match.match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references match.matches(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  slot integer not null check (slot between 1 and 4),
  team integer not null check (team in (1, 2)),
  grade_id_snapshot uuid references match.grades(id) on delete restrict,
  grade_strength_snapshot integer check (grade_strength_snapshot > 0),
  unique (match_id, member_id),
  unique (match_id, slot)
);

create table match.member_links (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  status match.link_status not null default 'pending',
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete restrict
);

create table match.offline_leases (
  game_day_id uuid primary key
    references match.game_days(id) on delete cascade,
  operator_id uuid not null references public.profiles(id) on delete restrict,
  device_id uuid not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > issued_at)
);

create table match.operations (
  id uuid primary key,
  game_day_id uuid references match.game_days(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  device_id uuid not null,
  operation_type text not null check (length(btrim(operation_type)) > 0),
  command_hash text not null check (length(btrim(command_hash)) > 0),
  base_version integer check (base_version >= 0),
  occurred_at timestamptz not null,
  applied_at timestamptz not null default now(),
  result jsonb not null
);

create table match.audit_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid references match.operations(id) on delete set null,
  target_type text not null check (length(btrim(target_type)) > 0),
  target_id uuid not null,
  action text not null check (length(btrim(action)) > 0),
  before_data jsonb,
  after_data jsonb,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  device_id uuid not null,
  source match.change_source not null,
  occurred_at timestamptz not null,
  applied_at timestamptz not null default now()
);

create table match.release_state (
  singleton boolean primary key default true,
  traffic_enabled boolean not null default false,
  enabled_at timestamptz,
  first_write_at timestamptz,
  schema_version integer not null default 1 check (schema_version > 0),
  updated_at timestamptz not null default now(),
  constraint release_state_singleton_true check (singleton),
  constraint release_state_enabled_timestamp check (
    not traffic_enabled or enabled_at is not null
  )
);

create index attendances_game_day_idx
  on match.attendances(game_day_id);
create index matches_game_day_status_idx
  on match.matches(game_day_id, status);
create index match_players_member_idx
  on match.match_players(member_id);
create unique index member_links_one_approved_member_idx
  on match.member_links(member_id)
  where status = 'approved';
create index audit_events_target_idx
  on match.audit_events(target_type, target_id, applied_at);

create view match.member_directory
with (security_invoker = true)
as
select
  member.id as member_id,
  member.member_code,
  member.name as legal_name,
  member.status as member_status,
  case when profile.member_id is null then 'pending' else 'ready' end
    as setup_status,
  profile.public_alias,
  profile.gender,
  profile.grade_id,
  grade.name as grade_name,
  grade.strength as grade_strength
from public.members as member
left join match.member_profiles as profile on profile.member_id = member.id
left join match.grades as grade on grade.id = profile.grade_id;

create or replace function match.guard_release_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'release_state singleton cannot be truncated';
  end if;

  if tg_op = 'DELETE' then
    raise exception 'release_state singleton cannot be deleted';
  end if;

  if old.singleton is distinct from new.singleton then
    raise exception 'release_state singleton key is immutable';
  end if;

  if old.first_write_at is not null
     and new.first_write_at is distinct from old.first_write_at then
    raise exception 'release_state first_write_at is immutable';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger release_state_guard
before update or delete on match.release_state
for each row execute function match.guard_release_state();

create trigger release_state_truncate_guard
before truncate on match.release_state
for each statement execute function match.guard_release_state();

insert into match.release_state (singleton) values (true);

alter table match.grades enable row level security;
alter table match.member_profiles enable row level security;
alter table match.seasons enable row level security;
alter table match.game_days enable row level security;
alter table match.attendances enable row level security;
alter table match.matches enable row level security;
alter table match.match_players enable row level security;
alter table match.member_links enable row level security;
alter table match.offline_leases enable row level security;
alter table match.operations enable row level security;
alter table match.audit_events enable row level security;
alter table match.release_state enable row level security;

revoke all on schema match from public, anon, authenticated;
revoke all on all tables in schema match from public, anon, authenticated;
revoke all on all sequences in schema match from public, anon, authenticated;
revoke all on all routines in schema match from public, anon, authenticated;

do $$
declare
  private_type regtype;
begin
  for private_type in
    select type.oid::regtype
    from pg_catalog.pg_type as type
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = type.typnamespace
    where namespace.nspname = 'match'
      and type.typtype in ('e', 'c')
  loop
    execute format(
      'revoke all privileges on type %s from public, anon, authenticated',
      private_type
    );
  end loop;
end;
$$;

alter default privileges in schema match
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema match
  revoke all on sequences from public, anon, authenticated;
alter default privileges in schema match
  revoke execute on routines from public, anon, authenticated;
alter default privileges in schema match
  revoke usage on types from public, anon, authenticated;
