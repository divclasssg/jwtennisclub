import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildFeeEligibilityFilter,
  formatCurrency,
  formatPeriodMonth,
  getCurrentPeriodMonth,
  getPeriodMonthEnd,
  isMemberActiveForPeriod,
  isMemberFeeTargetForPeriod,
  normalizePeriodMonth,
} from "./fee-model";
import { isMemberEligibleForPeriod } from "@/features/members/member-model";
import { isMemberActivityPending } from "@/features/members/member-list";

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

  it("uses Asia/Seoul when calculating the current payment month", () => {
    vi.stubEnv("TZ", "UTC");
    const currentPeriodMonth = getCurrentPeriodMonth(new Date("2026-07-31T15:00:00.000Z"));
    vi.unstubAllEnvs();

    expect(currentPeriodMonth).toBe("2026-08-01");
    expect(
      isMemberActivityPending(
        { activityStartMonth: "2026-08-01" },
        currentPeriodMonth,
      ),
    ).toBe(false);
    expect(
      isMemberActiveForPeriod(
        {
          status: "active",
          withdrawnDate: null,
          pauseStartMonth: null,
          activityStartMonth: "2026-08-01",
        },
        currentPeriodMonth,
      ),
    ).toBe(true);
  });

  it("keeps a member paused in August eligible for July fees only", () => {
    const pausedInAugust = {
      status: "paused" as const,
      pauseStartMonth: "2026-08-01",
    };

    expect(buildFeeEligibilityFilter("2026-07-01")).toBe(
      "status.eq.active,and(status.eq.paused,pause_start_month.gt.2026-07-01),and(status.eq.withdrawn,withdrawn_date.gt.2026-07-31)",
    );
    expect(isMemberEligibleForPeriod(pausedInAugust, "2026-07-01")).toBe(true);
    expect(isMemberEligibleForPeriod(pausedInAugust, "2026-08-01")).toBe(false);
  });

  it("uses the activity start month for activity and fee eligibility", () => {
    const startsInAugust = {
      status: "active" as const,
      joinedDate: "2026-07-20",
      withdrawnDate: null,
      pauseStartMonth: null,
      activityStartMonth: "2026-08-01",
    };

    expect(isMemberActiveForPeriod(startsInAugust, "2026-07-01")).toBe(false);
    expect(isMemberActiveForPeriod(startsInAugust, "2026-08-01")).toBe(true);
    expect(
      isMemberFeeTargetForPeriod(
        { ...startsInAugust, memberCode: "#0020" },
        "2026-08-01",
      ),
    ).toBe(true);
    expect(
      isMemberFeeTargetForPeriod(
        { ...startsInAugust, memberCode: "#0000" },
        "2026-08-01",
      ),
    ).toBe(false);
  });

  it("applies pause and withdrawal boundaries to monthly activity", () => {
    expect(
      isMemberActiveForPeriod(
        {
          status: "paused",
          withdrawnDate: null,
          pauseStartMonth: "2026-08-01",
          activityStartMonth: "2026-07-01",
        },
        "2026-07-01",
      ),
    ).toBe(true);
    expect(
      isMemberActiveForPeriod(
        {
          status: "paused",
          withdrawnDate: null,
          pauseStartMonth: "2026-08-01",
          activityStartMonth: "2026-07-01",
        },
        "2026-08-01",
      ),
    ).toBe(false);
    expect(
      isMemberActiveForPeriod(
        {
          status: "withdrawn",
          withdrawnDate: "2026-07-31",
          pauseStartMonth: null,
          activityStartMonth: "2026-07-01",
        },
        "2026-07-01",
      ),
    ).toBe(false);
    expect(
      isMemberActiveForPeriod(
        {
          status: "withdrawn",
          withdrawnDate: "2026-08-01",
          pauseStartMonth: null,
          activityStartMonth: "2026-07-01",
        },
        "2026-07-01",
      ),
    ).toBe(true);
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
