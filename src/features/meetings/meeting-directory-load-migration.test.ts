import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202607150003_optimize_meeting_directory_load.sql",
  ),
  "utf8",
).toLowerCase();

describe("meeting directory load migration", () => {
  it("combines month preparation and the pure directory query in one secured RPC", () => {
    expect(migrationSql).toContain(
      "create or replace function public.load_club_meeting_directory_page",
    );
    expect(migrationSql).toContain("returns jsonb");
    expect(migrationSql).toContain("security definer");
    expect(migrationSql).toContain("set search_path = ''");
    expect(migrationSql).toContain(
      "perform public.prepare_club_meeting_month(requested_period_month)",
    );
    expect(migrationSql).toContain(
      "return public.get_club_meeting_directory_page(\n    requested_period_month,\n    requested_selected_meeting_id",
    );
  });

  it("exposes only the combined RPC to authenticated users", () => {
    expect(migrationSql).toContain(
      "revoke execute on function public.load_club_meeting_directory_page(date, text) from public, anon",
    );
    expect(migrationSql).toContain(
      "grant execute on function public.load_club_meeting_directory_page(date, text) to authenticated",
    );
  });
});
