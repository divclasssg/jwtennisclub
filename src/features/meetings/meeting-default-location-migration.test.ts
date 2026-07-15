import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202607150004_default_meeting_location.sql",
  ),
  "utf8",
).toLowerCase();

function functionSql(functionName: string) {
  const start = migrationSql.indexOf(
    `create or replace function public.${functionName}`,
  );
  const end = migrationSql.indexOf("$$;", start);
  expect(start, functionName).toBeGreaterThan(-1);
  expect(end, functionName).toBeGreaterThan(start);
  return migrationSql.slice(start, end);
}

describe("meeting default location migration", () => {
  it("backfills nulls before setting the default and not-null constraint", () => {
    const backfill = migrationSql.indexOf(
      "update public.club_meetings\nset location = '용마테니스장'\nwhere location is null",
    );
    const setDefault = migrationSql.indexOf(
      "alter column location set default '용마테니스장'",
    );
    const setNotNull = migrationSql.indexOf(
      "alter column location set not null",
    );

    expect(backfill).toBeGreaterThan(-1);
    expect(setDefault).toBeGreaterThan(backfill);
    expect(setNotNull).toBeGreaterThan(setDefault);
  });

  it.each([
    "update_club_meeting_location",
    "create_lightning_club_meeting",
  ])("normalizes blank input in %s without weakening security", (name) => {
    const sql = functionSql(name);
    expect(sql).toContain(
      "coalesce(\n    nullif(pg_catalog.btrim(requested_location), ''),\n    '용마테니스장'\n  )",
    );
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
  });

  it("preserves authenticated-only execute grants", () => {
    expect(migrationSql).toContain(
      "grant execute on function public.update_club_meeting_location(uuid, text) to authenticated",
    );
    expect(migrationSql).toContain(
      "grant execute on function public.create_lightning_club_meeting(uuid, date, time, time, text) to authenticated",
    );
  });
});
