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
      "new.member_code := public.next_member_code(new.group_id)",
    );
    expect(migrationSql).toContain("if old.member_code is distinct from new.member_code");
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
      "coalesce(max(right(members.member_code, 4)::integer), 0) + 1",
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
    expect(migrationSql.match(/pg_advisory_xact_lock/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("preserves contacts for non-contact updates and rejects unauthorized contact changes", () => {
    expect(migrationSql).toContain("contact_update_requested boolean := member_data ? 'phone_number'");
    expect(migrationSql).toContain(
      "(member_id is null or contact_update_requested)",
    );
    expect(migrationSql).toContain("not public.has_permission('members.contacts.manage')");
    expect(migrationSql).toContain("if contact_update_requested then");
    expect(migrationSql).toContain("phone_last_four = case when contact_update_requested");
  });

  it("distinguishes an omitted group from an explicit group removal", () => {
    expect(migrationSql).toContain("when member_data ? 'group_id'");
    expect(migrationSql).toContain("then (member_data->>'group_id')::uuid");
    expect(migrationSql).toContain("else group_id");
  });

  it("rejects every ambiguous or inconsistent operator reconnect before deletion", () => {
    const validationPosition = migrationSql.indexOf("operator profile member UUID/name mismatch");
    const deletePosition = migrationSql.indexOf("delete from public.fee_payments");

    expect(validationPosition).toBeGreaterThan(-1);
    expect(migrationSql).toContain("operator profile must match exactly one imported member");
    expect(migrationSql).toContain("operator profile reconnect count mismatch");
    expect(validationPosition).toBeLessThan(deletePosition);
    expect(migrationSql).toContain("matched_member_id");
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
});
