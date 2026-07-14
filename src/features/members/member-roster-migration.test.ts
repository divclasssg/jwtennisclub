import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202607120001_prepare_member_roster_reset.sql",
  ),
  "utf8",
);

const finalizeMigrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202607120003_finalize_member_roster_reset.sql",
  ),
  "utf8",
);

const resetPatchMigrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202607120002_patch_roster_reset_safe_delete.sql",
  ),
  "utf8",
);

const meetingMigrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202607130002_add_club_meetings.sql",
  ),
  "utf8",
).toLowerCase();

const meetingRecoverySql = readFileSync(
  join(
    process.cwd(),
    "supabase/recovery/202607130002_restore_member_rpc_contracts.sql",
  ),
  "utf8",
).toLowerCase();

describe("member roster preparation migration", () => {
  it("backfills codes before making them required and assigns every insert", () => {
    const backfillPosition = migrationSql.indexOf("with numbered_members as");
    const notNullPosition = migrationSql.indexOf(
      "alter column member_code set not null",
    );

    expect(backfillPosition).toBeGreaterThan(-1);
    expect(notNullPosition).toBeGreaterThan(backfillPosition);
    expect(migrationSql).toContain("before insert on public.members");
    expect(migrationSql).toContain(
      "new.member_code := public.next_member_code()",
    );
    expect(migrationSql).toContain("if old.member_code is distinct from new.member_code");
  });

  it("stores one prefix and counter and allocates independently of group", () => {
    expect(migrationSql).toContain("create table public.member_code_allocator");
    expect(migrationSql).toContain("prefix text not null");
    expect(migrationSql).toContain("next_suffix integer not null");
    expect(migrationSql).toContain("create or replace function public.next_member_code()")
    expect(migrationSql).not.toContain("next_member_code(requested_group_id uuid)");
    expect(migrationSql).toContain("left(row.member_code, 1)");
    expect(migrationSql).toContain("max(right(row.member_code, 4)::integer) + 1");
    expect(migrationSql).toContain("prefix ~ '^[^0-9[:space:]]$'");
    expect(migrationSql).toContain(
      "member_code ~ '^[^0-9[:space:]][0-9]{4}$'",
    );
  });

  it("preserves an explicitly unassigned group in reset and normal saves", () => {
    expect(migrationSql).not.toContain("select id into new.group_id from public.member_groups where code = 'A'");
    expect(migrationSql).toContain("groups.id, now(), now()")
    expect(migrationSql).not.toContain("coalesce(groups.id, default_group.id)");
  });

  it("preserves imported codes only inside the service-role reset transaction", () => {
    expect(migrationSql).toContain("auth.role() = 'service_role'");
    expect(migrationSql).toContain(
      "current_setting('app.member_roster_reset_import', true) = 'on'",
    );
    expect(migrationSql).toContain(
      "perform set_config('app.member_roster_reset_import', 'on', true)",
    );
    expect(migrationSql).toContain(
      "row.id, btrim(row.name), row.member_code",
    );
  });

  it("allocates the next code from the global maximum imported suffix", () => {
    expect(migrationSql).toContain(
      "max(right(row.member_code, 4)::integer) + 1",
    );
    expect(migrationSql).not.toContain(
      "where members.member_code like group_code || '%'",
    );
  });

  it("returns both imported and reconnected profile counts", () => {
    expect(migrationSql).toContain(
      "'reconnected_profile_count', reconnected_profile_count",
    );
  });

  it("serializes phone and name duplicate decisions", () => {
    expect(migrationSql).toContain("member-contact-phone:");
    expect(migrationSql).toContain("member-contact-name:");
    expect(migrationSql.match(/pg_advisory_xact_lock/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migrationSql).toContain("from public.member_code_allocator where singleton for update");
  });

  it("preserves contacts for non-contact updates and rejects unauthorized contact changes", () => {
    expect(migrationSql).toContain("contact_update_requested boolean := member_data ? 'phone_number'");
    expect(migrationSql).toContain(
      "contact_update_requested",
    );
    expect(migrationSql).toContain("not public.has_permission('members.contacts.manage')");
    expect(migrationSql).toContain("if contact_update_requested then");
    expect(migrationSql).toContain("phone_last_four = case when contact_update_requested");
  });

  it("requires contact permission only for an actual contact key", () => {
    expect(migrationSql).toContain("if contact_update_requested")
    expect(migrationSql).not.toContain("(member_id is null or contact_update_requested)");
  });

  it("requires name-only confirmation for contactless creates but not omitted-contact updates", () => {
    expect(migrationSql).toContain("member_id is null and normalized_phone is null and name_exists");
    expect(migrationSql).not.toContain("if contact_update_requested and normalized_phone is null and name_exists");
  });

  it("uses one NFKC normalized name for manual save locks and comparisons", () => {
    const saveFunction = migrationSql.slice(
      migrationSql.indexOf("create or replace function public.save_member_with_contact"),
      migrationSql.indexOf("revoke execute on function public.save_member_with_contact"),
    );
    expect(saveFunction).toContain("normalized_name text := lower(btrim(normalize(member_data->>'name', NFKC)))");
    expect(saveFunction).toContain("'member-contact-name:' || normalized_name");
    expect(saveFunction).toContain("lower(btrim(normalize(duplicate_member.name, NFKC))) = normalized_name");
    expect(saveFunction).toContain("lower(btrim(normalize(name, NFKC))) = normalized_name");
  });

  it("distinguishes an omitted group from an explicit group removal", () => {
    expect(migrationSql).toContain("when member_data ? 'group_id'");
    expect(migrationSql).toContain("then (member_data->>'group_id')::uuid");
    expect(migrationSql).toContain("else group_id");
  });

  it("rejects every ambiguous or inconsistent operator reconnect before deletion", () => {
    const validationPosition = migrationSql.indexOf("operator profile must match exactly one imported member");
    const deletePosition = migrationSql.indexOf("delete from public.fee_payments");

    expect(validationPosition).toBeGreaterThan(-1);
    expect(migrationSql).toContain("operator profile must match exactly one imported member");
    expect(migrationSql).toContain("operator profile reconnect count mismatch");
    expect(validationPosition).toBeLessThan(deletePosition);
    expect(migrationSql).toContain("matched_member_id");
  });

  it("uses every active profile display name as the authoritative reconnect set", () => {
    expect(migrationSql).toContain("from public.profiles")
    expect(migrationSql).toContain("where status = 'active'");
    expect(migrationSql).toContain("normalize(display_name, NFKC)");
    expect(migrationSql).not.toContain("where operator_profile_id is not null");
  });

  it("rejects a changed active-profile UUID snapshot before destructive reset", () => {
    const validationPosition = migrationSql.indexOf("active profile set changed since preview");
    const deletePosition = migrationSql.indexOf("delete from public.fee_payments");
    expect(migrationSql).toContain("expected_active_profile_ids uuid[]");
    expect(migrationSql).toContain("array_agg(id order by id)");
    expect(validationPosition).toBeGreaterThan(-1);
    expect(validationPosition).toBeLessThan(deletePosition);
  });

  it("locks profiles before snapshot validation and before the allocator lock", () => {
    const resetFunctionStart = migrationSql.indexOf(
      "create or replace function public.admin_reset_member_roster",
    );
    const resetFunctionEnd = migrationSql.indexOf(
      "revoke execute on function public.admin_reset_member_roster",
      resetFunctionStart,
    );
    const resetFunction = migrationSql.slice(resetFunctionStart, resetFunctionEnd);
    const profilesLockPosition = resetFunction.indexOf(
      "lock table public.profiles in share mode",
    );
    const snapshotValidationPosition = resetFunction.indexOf(
      "active profile set changed since preview",
    );
    const snapshotTablePosition = resetFunction.indexOf(
      "create temporary table roster_profile_links",
    );
    const allocatorLockPosition = resetFunction.indexOf(
      "from public.member_code_allocator where singleton for update",
    );

    expect(profilesLockPosition).toBeGreaterThan(-1);
    expect(profilesLockPosition).toBeLessThan(snapshotValidationPosition);
    expect(profilesLockPosition).toBeLessThan(snapshotTablePosition);
    expect(profilesLockPosition).toBeLessThan(allocatorLockPosition);
    expect(resetFunction).toContain(
      "Lock order: profiles, then member_code_allocator, then member rows",
    );
  });

  it("stores canonical contact digits consistently", () => {
    expect(migrationSql).toContain("phone_number = phone_normalized");
    expect(migrationSql).toContain("saved_member_id, normalized_phone, normalized_phone");
  });

  it("validates the complete reset payload before deleting existing data", () => {
    const deletePosition = migrationSql.indexOf("delete from public.fee_payments");
    const requiredContracts = [
      "invalid imported group",
      "invalid imported member code",
      "imported member code prefixes must match",
      "duplicate imported member code",
      "imported member fields are required",
      "duplicate imported name and phone",
      "operator profile must match exactly one imported member",
    ];

    expect(deletePosition).toBeGreaterThan(-1);
    for (const contract of requiredContracts) {
      const validationPosition = migrationSql.indexOf(contract);
      expect(validationPosition, contract).toBeGreaterThan(-1);
      expect(validationPosition, contract).toBeLessThan(deletePosition);
    }
    expect(migrationSql).toContain("row.group_code is not null");
    expect(migrationSql).toContain("groups.is_active");
    expect(migrationSql).toContain("groups.code in ('A', 'B')");
  });

  it("uses explicit predicates for destructive deletes", () => {
    expect(migrationSql).toContain("delete from public.fee_payments where true");
    expect(migrationSql).toContain("delete from public.members where true");
    expect(resetPatchMigrationSql).toContain(
      "delete from public.fee_payments where true;",
    );
    expect(resetPatchMigrationSql).toContain(
      "delete from public.members where true;",
    );
  });

  it("rejects non-A/B groups and withdrawn rows before deleting existing data", () => {
    const deletePosition = migrationSql.indexOf("delete from public.fee_payments");
    const strictGroupPosition = migrationSql.indexOf("row.group_code not in ('A', 'B')");
    const activeGroupsPosition = migrationSql.indexOf("count(*) = 2");
    const statusPosition = migrationSql.indexOf("row.status not in ('active', 'paused')");

    expect(strictGroupPosition).toBeGreaterThan(-1);
    expect(activeGroupsPosition).toBeGreaterThan(-1);
    expect(statusPosition).toBeGreaterThan(-1);
    expect(strictGroupPosition).toBeLessThan(deletePosition);
    expect(activeGroupsPosition).toBeLessThan(deletePosition);
    expect(statusPosition).toBeLessThan(deletePosition);
  });

  it("returns masked contacts only for requested member IDs after checking view permission", () => {
    expect(migrationSql).toContain(
      "get_masked_member_contacts(member_ids uuid[])",
    );
    expect(migrationSql).toContain("public.has_permission('members.view')");
    expect(migrationSql).toContain(
      "member_contacts.member_id = any(member_ids)",
    );
  });

  it("records a durable completion marker only after a successful roster reset", () => {
    const deletePosition = migrationSql.indexOf("delete from public.fee_payments");
    const markerPosition = migrationSql.indexOf(
      "insert into public.member_roster_reset_state",
    );
    const resetFunctionPosition = migrationSql.indexOf(
      "create or replace function public.admin_reset_member_roster",
    );
    const resultPosition = migrationSql.indexOf(
      "return jsonb_build_object",
      resetFunctionPosition,
    );

    expect(migrationSql).toContain("create table public.member_roster_reset_state");
    expect(markerPosition).toBeGreaterThan(deletePosition);
    expect(markerPosition).toBeLessThan(resultPosition);
    expect(migrationSql).toContain("marker_kind = excluded.marker_kind");
  });
});

describe("member roster finalization migration", () => {
  it("locks every authorization table in the global order before checking the marker", () => {
    const firstGuardPosition = finalizeMigrationSql.indexOf("do $$");
    const orderedLocks = [
      "lock table public.profiles in share mode",
      "lock table public.member_code_allocator in share mode",
      "lock table public.members in share mode",
      "lock table public.fee_payments in share mode",
      "lock table public.expenses in share mode",
      "lock table public.events in share mode",
      "lock table public.audit_logs in share mode",
    ];

    let previousPosition = -1;
    for (const lock of orderedLocks) {
      const lockPosition = finalizeMigrationSql.indexOf(lock);
      expect(lockPosition, lock).toBeGreaterThan(previousPosition);
      expect(lockPosition, lock).toBeLessThan(firstGuardPosition);
      previousPosition = lockPosition;
    }
  });

  it("bootstraps only a genuinely pristine database and blocks an emptied production database", () => {
    const guardPosition = finalizeMigrationSql.indexOf(
      "member roster reset has not been completed",
    );
    const dropPosition = finalizeMigrationSql.indexOf("drop column if exists phone_last_four");

    expect(guardPosition).toBeGreaterThan(-1);
    expect(guardPosition).toBeLessThan(dropPosition);
    expect(finalizeMigrationSql).toContain("'bootstrap_empty'");
    expect(finalizeMigrationSql).toContain("not exists (select 1 from public.members)");
    expect(finalizeMigrationSql).toContain("not exists (select 1 from public.profiles)");
    expect(finalizeMigrationSql).toContain("not exists (select 1 from public.fee_payments)");
    expect(finalizeMigrationSql).toContain("not exists (select 1 from public.expenses)");
    expect(finalizeMigrationSql).toContain("not exists (select 1 from public.events)");
    expect(finalizeMigrationSql).toContain("not exists (select 1 from public.audit_logs)");
    expect(finalizeMigrationSql).toContain("from public.member_roster_reset_state");
    expect(finalizeMigrationSql).toContain("marker_kind in ('reset_complete', 'bootstrap_empty')");
  });

  it("asserts the permanent member-code contract before destructive cleanup", () => {
    expect(finalizeMigrationSql).toContain("attnotnull");
    expect(finalizeMigrationSql).toContain("members_member_code_format");
    expect(finalizeMigrationSql).toContain("members_member_code_unique");
    expect(finalizeMigrationSql).toContain("members_prevent_member_code_change");
    expect(finalizeMigrationSql).toContain("public.prevent_member_code_change()");
    expect(finalizeMigrationSql).toContain(
      "member_code !~ '^[^0-9[:space:]][0-9]{4}$'",
    );
  });

  it("requires the reset marker count to equal the exact current roster count", () => {
    expect(finalizeMigrationSql).toContain(
      "member_count = (select count(*) from public.members)",
    );
    expect(finalizeMigrationSql).not.toContain(
      "member_count > 0 and exists (select 1 from public.members)",
    );
  });

  it("replaces the rollout partial index with a global member-code unique index", () => {
    const notNullPosition = finalizeMigrationSql.indexOf(
      "alter column member_code set not null",
    );
    const dropIndexPosition = finalizeMigrationSql.indexOf(
      "drop index if exists public.members_member_code_unique",
    );
    const createIndexPosition = finalizeMigrationSql.indexOf(
      "create unique index members_member_code_unique\non public.members(member_code);",
    );

    expect(notNullPosition).toBeGreaterThan(-1);
    expect(dropIndexPosition).toBeGreaterThan(notNullPosition);
    expect(createIndexPosition).toBeGreaterThan(dropIndexPosition);
    expect(finalizeMigrationSql).toContain("index_metadata.indpred is null");
    expect(finalizeMigrationSql).toContain(
      "index_metadata.indkey[0] = member_code_attribute.attnum",
    );
  });

  it("removes legacy fields and retires every reset function privilege", () => {
    expect(finalizeMigrationSql).toContain("drop column if exists phone_last_four");
    expect(finalizeMigrationSql).toContain("drop column if exists withdrawal_reason");
    expect(finalizeMigrationSql).toContain(
      "revoke execute on function public.admin_reset_member_roster(jsonb, text, uuid[])",
    );
    expect(finalizeMigrationSql).toContain(
      "drop function public.admin_reset_member_roster(jsonb, text, uuid[])",
    );
  });

  it("keeps member saves compatible with the finalized schema", () => {
    const saveFunctionStart = finalizeMigrationSql.indexOf(
      "create or replace function public.save_member_with_contact",
    );
    const saveFunctionEnd = finalizeMigrationSql.indexOf(
      "revoke execute on function public.save_member_with_contact",
    );
    const saveFunction = finalizeMigrationSql.slice(saveFunctionStart, saveFunctionEnd);

    expect(saveFunctionStart).toBeGreaterThan(-1);
    expect(saveFunction).not.toContain("phone_last_four");
    expect(saveFunction).not.toContain("withdrawal_reason");
    expect(saveFunction).toContain("member_data ? 'phone_number'");
    expect(saveFunction).toContain("member_id is null and normalized_phone is null and name_exists");
    expect(saveFunction).toContain("normalized_name text := lower(btrim(normalize(member_data->>'name', NFKC)))");
  });
});

describe("meeting roster member-write integration", () => {
  it("defines idempotent KST meeting and roster automation with a single bootstrap", () => {
    expect(meetingMigrationSql).toContain("at time zone 'asia/seoul'");
    expect(meetingMigrationSql).toContain("order by period_month");
    expect(meetingMigrationSql).toContain("meeting-period-month:");
    expect(meetingMigrationSql).toContain(
      "meeting_month_rosters_single_bootstrap_unique",
    );
    expect(meetingMigrationSql).toContain(
      "on conflict (period_month, regular_occurrence)",
    );
    expect(meetingMigrationSql).toContain(
      "on conflict (meeting_id, member_id) do nothing",
    );
    expect(meetingMigrationSql).toContain(
      "active profile required to bootstrap club meeting automation",
    );
  });

  it("locks meeting months before member changes and syncs the next preparing roster afterward", () => {
    const saveStart = meetingMigrationSql.indexOf(
      "create or replace function public.save_member_with_contact",
    );
    const saveEnd = meetingMigrationSql.indexOf(
      "revoke execute on function public.save_member_with_contact",
      saveStart,
    );
    const saveFunction = meetingMigrationSql.slice(saveStart, saveEnd);
    const lockPosition = saveFunction.indexOf(
      "public.prepare_meeting_rosters_before_member_change",
    );
    const memberWritePosition = saveFunction.indexOf(
      "insert into public.members",
    );
    const syncPosition = saveFunction.indexOf(
      "public.sync_meeting_rosters_after_member_change",
    );

    expect(saveStart).toBeGreaterThan(-1);
    expect(lockPosition).toBeGreaterThan(-1);
    expect(memberWritePosition).toBeGreaterThan(lockPosition);
    expect(syncPosition).toBeGreaterThan(memberWritePosition);
    expect(saveFunction).toContain("returns jsonb");
    expect(saveFunction).toContain("set search_path = ''");
    expect(saveFunction).toMatch(/'status',\s*'saved'/);
    expect(saveFunction).toMatch(/'member_id',\s*saved_member_id/);
    expect(saveFunction).toContain("'member_code'");
  });

  it("routes operator member creation and name synchronization through the same roster boundary", () => {
    for (const helper of [
      "ensure_operator_member",
      "sync_operator_member_name",
    ]) {
      const start = meetingMigrationSql.indexOf(
        `create or replace function public.${helper}()`,
      );
      const end = meetingMigrationSql.indexOf("$$;", start);
      const functionSql = meetingMigrationSql.slice(start, end);

      expect(start, helper).toBeGreaterThan(-1);
      expect(functionSql).toContain("set search_path = ''");
      expect(functionSql).toContain(
        "public.prepare_meeting_rosters_before_member_change",
      );
      expect(functionSql).toContain(
        "public.sync_meeting_rosters_after_member_change",
      );
    }
  });

  it("revokes authenticated direct member writes without changing the public save signature", () => {
    expect(meetingMigrationSql).toContain(
      "revoke insert, update, delete on table public.members from authenticated",
    );
    expect(meetingMigrationSql).toMatch(
      /revoke execute on function public\.save_member_with_contact\(uuid, jsonb, text\)\s+from public, anon/,
    );
    expect(meetingMigrationSql).toMatch(
      /grant execute on function public\.save_member_with_contact\(uuid, jsonb, text\)\s+to authenticated/,
    );
  });

  it("provides a forward recovery script for only the three member integration functions", () => {
    for (const helper of [
      "save_member_with_contact",
      "ensure_operator_member",
      "sync_operator_member_name",
    ]) {
      expect(meetingRecoverySql).toContain(
        `create or replace function public.${helper}`,
      );
    }
    expect(meetingRecoverySql).toContain("set search_path = ''");
    expect(meetingRecoverySql).not.toContain("drop table");
    expect(meetingRecoverySql).not.toContain("delete from public.meeting_");
  });
});
