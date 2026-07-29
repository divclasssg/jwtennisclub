import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFeeEligibilityFilter,
  formatCurrency,
  formatPeriodMonth,
  getPeriodMonthEnd,
  normalizePeriodMonth,
} from "./fee-model";
import { isMemberEligibleForPeriod } from "@/features/members/member-model";

const migrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/202607030003_add_fee_payments.sql"),
  "utf8",
);

describe("fee model", () => {
  it("normalizes month inputs to the first day of the month", () => {
    expect(normalizePeriodMonth("2026-07")).toBe("2026-07-01");
    expect(normalizePeriodMonth("2026-07-18")).toBe("2026-07-01");
    expect(normalizePeriodMonth("bad")).toBe("");
  });

  it("formats fee values for operators", () => {
    expect(formatPeriodMonth("2026-07-01")).toBe("2026.07");
    expect(formatCurrency(50000)).toBe("50,000");
  });

  it("calculates the last day for a payment month", () => {
    expect(getPeriodMonthEnd("2026-02-01")).toBe("2026-02-28");
  });

  it("keeps a member paused in August eligible for July fees only", () => {
    const pausedInAugust = {
      status: "paused" as const,
      pauseStartMonth: "2026-08-01",
    };

    expect(buildFeeEligibilityFilter("2026-07-01")).toBe(
      "status.eq.active,and(status.eq.paused,pause_start_month.gt.2026-07-01)",
    );
    expect(isMemberEligibleForPeriod(pausedInAugust, "2026-07-01")).toBe(true);
    expect(isMemberEligibleForPeriod(pausedInAugust, "2026-08-01")).toBe(false);
  });
});

describe("fee payments migration", () => {
  it("creates fee payments with a member and month uniqueness rule", () => {
    expect(migrationSql).toContain(
      "create table if not exists public.fee_payments",
    );
    expect(migrationSql).toContain(
      "member_id uuid not null references public.members(id)",
    );
    expect(migrationSql).toContain("period_month date not null");
    expect(migrationSql).toContain("amount integer not null");
    expect(migrationSql).toContain(
      "constraint fee_payments_member_month_unique unique (member_id, period_month)",
    );
  });

  it("keeps fee payment RLS permission based", () => {
    expect(migrationSql).toContain("public.has_permission('fees.payments.view')");
    expect(migrationSql).toContain(
      "public.has_permission('fees.payments.create')",
    );
    expect(migrationSql).toContain(
      "public.has_permission('fees.payments.update')",
    );
    expect(migrationSql).toContain(
      "public.has_permission('fees.payments.delete')",
    );
  });
});
