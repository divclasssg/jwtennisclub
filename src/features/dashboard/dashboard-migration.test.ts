import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/202608010001_add_dashboard_page.sql",
);
const sql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8").toLowerCase()
  : "";

describe("dashboard page migration", () => {
  it("exposes only the secured privacy-safe dashboard aggregate", () => {
    expect(sql).toContain("function public.get_dashboard_page()\nreturns jsonb");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("profiles.id = auth.uid()");
    expect(sql).toContain("profiles.status = 'active'");
    expect(sql).toContain("public.build_monthly_settlement_snapshot(");
    expect(sql).toContain("closings.closing_kind = 'final'");
    expect(sql).toContain("closings.status = 'closed'");
    expect(sql).toContain("interval '5 months'");
    expect(sql).toContain("date '2026-07-01'");
    expect(sql).toContain(
      "revoke execute on function public.get_dashboard_page() from public, anon",
    );
    expect(sql).toContain(
      "grant execute on function public.get_dashboard_page() to authenticated",
    );
    expect(sql).not.toContain("members.name");
    expect(sql).not.toContain("phone_number");
    expect(sql).not.toContain("expense_rows");
  });
});
