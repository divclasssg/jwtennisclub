import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isFeeChargeTarget,
  MEMBER_STATUSES,
  validateMemberLifecycle,
} from "./member-model";

const migrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/202607030002_add_members.sql"),
  "utf8",
);
const operatorMemberMigrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202607030004_auto_add_operator_members.sql",
  ),
  "utf8",
);

describe("member model", () => {
  it("defines the supported member statuses", () => {
    expect(MEMBER_STATUSES).toEqual(["active", "paused", "withdrawn"]);
  });

  it("treats only active members as monthly fee charge targets", () => {
    expect(isFeeChargeTarget("active")).toBe(true);
    expect(isFeeChargeTarget("paused")).toBe(false);
    expect(isFeeChargeTarget("withdrawn")).toBe(false);
  });

  it("requires withdrawn members to have a withdrawal date", () => {
    expect(
      validateMemberLifecycle({
        status: "withdrawn",
        joinedDate: "2026-07-01",
        withdrawnDate: null,
        withdrawalReason: null,
      }),
    ).toContain("탈퇴 회원은 탈퇴일이 필요합니다.");
  });

  it("keeps withdrawal dates only on withdrawn members", () => {
    expect(
      validateMemberLifecycle({
        status: "paused",
        joinedDate: "2026-07-01",
        withdrawnDate: "2026-07-02",
        withdrawalReason: null,
      }),
    ).toContain("활동중 또는 휴회 회원은 탈퇴일을 비워야 합니다.");
  });

  it("keeps withdrawal reasons only on withdrawn members", () => {
    expect(
      validateMemberLifecycle({
        status: "active",
        joinedDate: "2026-07-01",
        withdrawnDate: null,
        withdrawalReason: "개인 사정",
      }),
    ).toContain("활동중 또는 휴회 회원은 탈퇴 사유를 비워야 합니다.");
  });

  it("prevents withdrawal dates before the joined date", () => {
    expect(
      validateMemberLifecycle({
        status: "withdrawn",
        joinedDate: "2026-07-02",
        withdrawnDate: "2026-07-01",
        withdrawalReason: null,
      }),
    ).toContain("탈퇴일은 가입일보다 빠를 수 없습니다.");
  });
});

describe("members migration", () => {
  it("defines the member status enum and members table", () => {
    expect(migrationSql).toContain(
      "create type public.member_status as enum ('active', 'paused', 'withdrawn');",
    );
    expect(migrationSql).toContain("create table public.members");
    expect(migrationSql).toContain(
      "status public.member_status not null default 'active'",
    );
    expect(migrationSql).toContain("phone_last_four text");
    expect(migrationSql).toContain("joined_date date not null");
    expect(migrationSql).toContain("withdrawn_date date");
    expect(migrationSql).toContain("withdrawal_reason text");
  });

  it("stores only the last four phone digits when provided", () => {
    expect(migrationSql).toContain("constraint members_phone_last_four_digits");
    expect(migrationSql).toContain("phone_last_four ~ '^[0-9]{4}$'");
    expect(migrationSql).not.toContain("phone_number");
  });

  it("enforces withdrawal lifecycle constraints in SQL", () => {
    expect(migrationSql).toContain(
      "constraint members_withdrawn_date_matches_status",
    );
    expect(migrationSql).toContain(
      "constraint members_withdrawn_after_joined",
    );
    expect(migrationSql).toContain(
      "constraint members_withdrawal_reason_matches_status",
    );
    expect(migrationSql).toContain(
      "constraint members_withdrawal_reason_not_blank",
    );
  });

  it("uses a stable uuid primary key for future fee records", () => {
    expect(migrationSql).toContain("id uuid primary key default gen_random_uuid()");
  });

  it("uses permission-based row level security policies", () => {
    expect(migrationSql).toContain("create or replace function public.has_permission");
    expect(migrationSql).toContain("public.has_permission('members.view')");
    expect(migrationSql).toContain("public.has_permission('members.create')");
    expect(migrationSql).toContain("public.has_permission('members.update')");
    expect(migrationSql).toContain("public.has_permission('members.delete')");
  });

  it("links operator profiles to automatically created member records", () => {
    expect(operatorMemberMigrationSql).toContain(
      "add column operator_profile_id uuid unique references public.profiles(id)",
    );
    expect(operatorMemberMigrationSql).toContain(
      "create or replace function public.ensure_operator_member()",
    );
    expect(operatorMemberMigrationSql).toContain(
      "create trigger profiles_auto_add_member",
    );
    expect(operatorMemberMigrationSql).toContain(
      "after insert on public.profiles",
    );
    expect(operatorMemberMigrationSql).toContain(
      "운영자 계정 생성으로 자동 등록",
    );
  });
});
