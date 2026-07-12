create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version text primary key
);

alter table supabase_migrations.schema_migrations
  add column if not exists statements text[],
  add column if not exists name text;

insert into supabase_migrations.schema_migrations (version, name, statements)
values
  ('202607020001', 'foundation', array['-- Applied manually before migration history initialization.']),
  ('202607030001', 'add_club_positions', array['-- Applied manually before migration history initialization.']),
  ('202607030002', 'add_members', array['-- Applied manually before migration history initialization.']),
  ('202607030003', 'add_fee_payments', array['-- Applied manually before migration history initialization.']),
  ('202607030004', 'auto_add_operator_members', array['-- Applied manually before migration history initialization.']),
  ('202607030005', 'add_expenses', array['-- Applied manually before migration history initialization.']),
  ('202607030006', 'add_expense_receipts_r2', array['-- Applied manually before migration history initialization.']),
  ('202607040001', 'add_events', array['-- Applied manually before migration history initialization.']),
  ('202607120001', 'prepare_member_roster_reset', array['-- Applied manually before migration history initialization.']),
  ('202607120002', 'patch_roster_reset_safe_delete', array['-- Applied manually before migration history initialization.']),
  ('202607120003', 'finalize_member_roster_reset', array['-- Applied manually before migration history initialization.'])
on conflict (version) do update
set name = excluded.name,
    statements = coalesce(
      supabase_migrations.schema_migrations.statements,
      excluded.statements
    );
