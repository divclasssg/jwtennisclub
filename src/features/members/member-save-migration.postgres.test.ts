import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202607270001_fix_member_save_parameter_ambiguity.sql",
  ),
  "utf8",
);

const operatorId = "00000000-0000-4000-8000-000000000001";
const generatedMemberId = "00000000-0000-4000-8000-000000000020";
const existingMemberId = "00000000-0000-4000-8000-000000000019";

let database: PGlite;

async function setPermissionContext(permissions: string[]) {
  await database.query(
    "select set_config('app.test_user_id', $1, false), set_config('app.test_permissions', $2, false)",
    [operatorId, permissions.join(",")],
  );
}

async function countRows(tableName: "members" | "member_contacts") {
  const result = await database.query<{ count: number }>(
    `select count(*)::integer as count from public.${tableName}`,
  );
  return result.rows[0]?.count;
}

beforeEach(async () => {
  database = new PGlite();

  await database.exec(`
    create role anon;
    create role authenticated;
    create schema auth;

    create function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('app.test_user_id', true), '')::uuid;
    $$;

    create function public.has_permission(requested_permission text)
    returns boolean
    language sql
    stable
    as $$
      select requested_permission = any(
        string_to_array(
          coalesce(current_setting('app.test_permissions', true), ''),
          ','
        )
      );
    $$;

    create function public.meeting_kst_today()
    returns date
    language sql
    stable
    as $$ select date '2026-08-01'; $$;

    create function public.prepare_meeting_rosters_before_member_change(
      requested_date date,
      actor_profile_id uuid
    )
    returns void
    language sql
    as $$ select; $$;

    create function public.sync_meeting_rosters_after_member_change(
      requested_date date
    )
    returns void
    language sql
    as $$ select; $$;

    create type public.member_status as enum ('active', 'paused', 'withdrawn');

    create table public.members (
      id uuid primary key default '${generatedMemberId}',
      name text not null,
      status public.member_status not null,
      joined_date date not null,
      withdrawn_date date,
      memo text,
      created_by uuid,
      updated_by uuid,
      group_id uuid,
      member_code text not null default '#0020',
      updated_at timestamptz not null default now()
    );

    create table public.member_contacts (
      member_id uuid primary key references public.members(id) on delete cascade,
      phone_number text,
      phone_normalized text,
      updated_by uuid,
      updated_at timestamptz not null default now()
    );
  `);

  await database.exec(migrationSql);
});

afterEach(async () => {
  await database.close();
});

describe("member save ambiguity migration in PostgreSQL", () => {
  it("compiles the RPC and grants execution only to authenticated users", async () => {
    const privileges = await database.query<{
      anon_can_execute: boolean;
      authenticated_can_execute: boolean;
    }>(`
      select
        has_function_privilege(
          'anon',
          'public.save_member_with_contact(uuid,jsonb,text)',
          'execute'
        ) as anon_can_execute,
        has_function_privilege(
          'authenticated',
          'public.save_member_with_contact(uuid,jsonb,text)',
          'execute'
        ) as authenticated_can_execute;
    `);

    expect(privileges.rows[0]).toEqual({
      anon_can_execute: false,
      authenticated_can_execute: true,
    });
  });

  it("rejects member creation without members.create", async () => {
    await setPermissionContext([]);

    await expect(
      database.query(
        "select public.save_member_with_contact(null, $1::jsonb, null)",
        [JSON.stringify({ name: "권한 없음" })],
      ),
    ).rejects.toThrow("members.create permission required");
    await expect(countRows("members")).resolves.toBe(0);
  });

  it("rejects a contact write without members.contacts.manage", async () => {
    await setPermissionContext(["members.create"]);

    await expect(
      database.query(
        "select public.save_member_with_contact(null, $1::jsonb, null)",
        [JSON.stringify({ name: "연락처 권한 없음", phone_number: "01012345678" })],
      ),
    ).rejects.toThrow("members.contacts.manage permission required");
    await expect(countRows("members")).resolves.toBe(0);
    await expect(countRows("member_contacts")).resolves.toBe(0);
  });

  it("saves a member and contact with both required permissions", async () => {
    await setPermissionContext([
      "members.create",
      "members.contacts.manage",
    ]);

    const saved = await database.query<{
      result: {
        status: string;
        member_id: string;
        member_code: string;
      };
    }>(
      "select public.save_member_with_contact(null, $1::jsonb, null) as result",
      [JSON.stringify({ name: "신규 회원", phone_number: "01012345678" })],
    );

    expect(saved.rows[0]?.result).toEqual({
      status: "SAVED",
      member_id: generatedMemberId,
      member_code: "#0020",
    });
    await expect(countRows("members")).resolves.toBe(1);
    await expect(countRows("member_contacts")).resolves.toBe(1);
  });

  it("updates the requested member without an ambiguous member_id reference", async () => {
    await database.query(
      `
        insert into public.members (id, name, status, joined_date, member_code)
        values ($1, '기존 회원', 'active', date '2026-07-01', '#0019')
      `,
      [existingMemberId],
    );
    await database.query(
      `
        insert into public.member_contacts (
          member_id,
          phone_number,
          phone_normalized
        ) values ($1, '01099998888', '01099998888')
      `,
      [existingMemberId],
    );
    await setPermissionContext(["members.update"]);

    const saved = await database.query<{
      result: { status: string; member_id: string; member_code: string };
    }>(
      "select public.save_member_with_contact($1, $2::jsonb, null) as result",
      [existingMemberId, JSON.stringify({ name: "수정 회원" })],
    );
    const contact = await database.query<{ phone_number: string }>(
      "select phone_number from public.member_contacts where member_id = $1",
      [existingMemberId],
    );

    expect(saved.rows[0]?.result).toEqual({
      status: "SAVED",
      member_id: existingMemberId,
      member_code: "#0019",
    });
    expect(contact.rows).toEqual([{ phone_number: "01099998888" }]);
  });
});
