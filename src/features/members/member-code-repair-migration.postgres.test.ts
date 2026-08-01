import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202607270002_resequence_first_post_reset_member_code.sql",
  ),
  "utf8",
);

const testMemberId = "00000000-0000-4000-8000-000000000024";

let database: PGlite | undefined;

async function createMigrationFixture({
  memberCode,
  nextSuffix,
}: {
  memberCode: string;
  nextSuffix: number;
}) {
  database = new PGlite();

  await database.exec(`
    create table public.members (
      id uuid primary key,
      member_code text not null unique
    );

    create table public.member_code_allocator (
      singleton boolean primary key,
      prefix text not null,
      next_suffix integer not null
    );

    create table public.meeting_month_roster_members (
      member_id uuid not null references public.members(id),
      member_code_snapshot text not null
    );

    create table public.meeting_attendance (
      member_id uuid not null references public.members(id),
      member_code_snapshot text not null
    );

    create function public.prevent_member_code_change()
    returns trigger
    language plpgsql
    as $$
    begin
      if old.member_code is distinct from new.member_code then
        raise exception 'member code cannot change';
      end if;
      return new;
    end;
    $$;

    create trigger members_prevent_member_code_change
    before update of member_code on public.members
    for each row execute function public.prevent_member_code_change();

    insert into public.members (id, member_code)
    values ('${testMemberId}', '${memberCode}');

    insert into public.member_code_allocator (singleton, prefix, next_suffix)
    values (true, '#', ${nextSuffix});

    insert into public.meeting_month_roster_members (
      member_id,
      member_code_snapshot
    ) values ('${testMemberId}', '${memberCode}');

    insert into public.meeting_attendance (member_id, member_code_snapshot)
    values ('${testMemberId}', '${memberCode}');
  `);

  return database;
}

async function readRepairState(pg: PGlite) {
  const members = await pg.query<{ member_code: string }>(
    "select member_code from public.members order by member_code",
  );
  const allocator = await pg.query<{ next_suffix: number }>(
    "select next_suffix from public.member_code_allocator where singleton",
  );
  const rosterSnapshots = await pg.query<{ member_code_snapshot: string }>(
    "select member_code_snapshot from public.meeting_month_roster_members",
  );
  const attendanceSnapshots = await pg.query<{
    member_code_snapshot: string;
  }>("select member_code_snapshot from public.meeting_attendance");

  return {
    memberCodes: members.rows.map((row) => row.member_code),
    nextSuffix: allocator.rows[0]?.next_suffix,
    rosterSnapshots: rosterSnapshots.rows.map(
      (row) => row.member_code_snapshot,
    ),
    attendanceSnapshots: attendanceSnapshots.rows.map(
      (row) => row.member_code_snapshot,
    ),
  };
}

afterEach(async () => {
  await database?.close();
  database = undefined;
});

describe("first post-reset member code migration in PostgreSQL", () => {
  it("does not rewrite a legitimate database that merely resembles the incident", async () => {
    const pg = await createMigrationFixture({
      memberCode: "#0024",
      nextSuffix: 25,
    });

    await pg.exec(migrationSql);

    await expect(readRepairState(pg)).resolves.toEqual({
      memberCodes: ["#0024"],
      nextSuffix: 25,
      rosterSnapshots: ["#0024"],
      attendanceSnapshots: ["#0024"],
    });
  });

  it("accepts an already-applied repair without changing its state", async () => {
    const pg = await createMigrationFixture({
      memberCode: "#0020",
      nextSuffix: 21,
    });

    await pg.exec(migrationSql);

    await expect(readRepairState(pg)).resolves.toEqual({
      memberCodes: ["#0020"],
      nextSuffix: 21,
      rosterSnapshots: ["#0020"],
      attendanceSnapshots: ["#0020"],
    });
  });

  it("rolls back when an already-applied repair has a stale snapshot", async () => {
    const pg = await createMigrationFixture({
      memberCode: "#0020",
      nextSuffix: 21,
    });
    await pg.exec(`
      update public.meeting_attendance
      set member_code_snapshot = '#0024';
    `);

    await expect(pg.exec(migrationSql)).rejects.toThrow(
      "meeting member code snapshots were not corrected",
    );
    await pg.exec("rollback");

    await expect(readRepairState(pg)).resolves.toEqual({
      memberCodes: ["#0020"],
      nextSuffix: 21,
      rosterSnapshots: ["#0020"],
      attendanceSnapshots: ["#0024"],
    });
  });
});
