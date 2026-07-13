import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/202607130001_optimize_navigation_queries.sql";
const migrationSql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8").toLowerCase()
  : "";

describe("navigation query optimization migration", () => {
  it("defines a request-safe current operator context function", () => {
    expect(migrationSql).toContain("function public.get_current_operator_context()");
    expect(migrationSql).toContain("security definer");
    expect(migrationSql).toContain("set search_path = ''");
    expect(migrationSql).toContain("auth.uid()");
    expect(migrationSql).toContain("profiles.status = 'active'");
    expect(migrationSql).toContain("jsonb_agg(role_permissions.permission");
  });

  it("exposes the function only to authenticated users", () => {
    expect(migrationSql).toContain("revoke execute on function public.get_current_operator_context() from public, anon");
    expect(migrationSql).toContain("grant execute on function public.get_current_operator_context() to authenticated");
  });

  it("defines an authenticated member directory function with server-side contact masking", () => {
    expect(migrationSql).toContain("function public.get_member_directory_page(");
    expect(migrationSql).toContain("auth.uid()");
    expect(migrationSql).toContain("members.contacts.manage");
    expect(migrationSql).toContain("public.mask_phone_number(member_contacts.phone_number)");
    expect(migrationSql).toContain("set search_path = ''");
    expect(migrationSql).toContain("grant execute on function public.get_member_directory_page(text, text) to authenticated");
  });
});
