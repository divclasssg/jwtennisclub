import { describe, expect, it } from "vitest";
import { parseDashboardPage } from "./dashboard-page";

const finalClosingId = "11111111-1111-4111-8111-111111111111";
const interimClosingId = "22222222-2222-4222-8222-222222222222";

function databaseSummary(overrides: Record<string, unknown> = {}) {
  return {
    billed_total: 600000,
    actual_fee_income: 510000,
    expense_total: 130000,
    attributed_net: 380000,
    fully_paid_count: 17,
    fee_target_count: 20,
    unpaid_count: 3,
    unpaid_total: 90000,
    opening_ledger_balance: 395000,
    closing_ledger_balance: 775000,
    ...overrides,
  };
}

function finalReference(overrides: Record<string, unknown> = {}) {
  return {
    id: finalClosingId,
    closing_kind: "final",
    version: 1,
    status: "closed",
    ...overrides,
  };
}

function interimReference(overrides: Record<string, unknown> = {}) {
  return {
    id: interimClosingId,
    closing_kind: "interim",
    version: 2,
    status: "closed",
    ...overrides,
  };
}

function databasePage(overrides: Record<string, unknown> = {}) {
  return {
    as_of: "2026-08-01T00:00:00.000Z",
    period_month: "2026-08-01",
    members: {
      active_count: 20,
      upcoming_count: 2,
      paused_count: 1,
      joined_this_month_count: 1,
      paused_this_month_count: 0,
      withdrawn_this_month_count: 0,
    },
    current_finance: {
      status: "available",
      blocked_reason: null,
      source: "current",
      summary: databaseSummary(),
      active_final: null,
      latest_interim: interimReference(),
    },
    latest_final: {
      ...finalReference(),
      period_month: "2026-07-01",
      closed_at: "2026-07-31T00:00:00.000Z",
      ...databaseSummary({
        opening_ledger_balance: 0,
        closing_ledger_balance: 380000,
      }),
    },
    trends: [
      {
        period_month: "2026-07-01",
        source: "final",
        actual_fee_income: 510000,
        expense_total: 130000,
        closing_ledger_balance: 380000,
      },
      {
        period_month: "2026-08-01",
        source: "current",
        actual_fee_income: 510000,
        expense_total: 130000,
        closing_ledger_balance: 775000,
      },
    ],
    ...overrides,
  };
}

describe("dashboard page parser", () => {
  it("maps an available aggregate-only database payload to camelCase", () => {
    expect(parseDashboardPage(databasePage())).toEqual({
      asOf: "2026-08-01T00:00:00.000Z",
      periodMonth: "2026-08-01",
      members: {
        activeCount: 20,
        upcomingCount: 2,
        pausedCount: 1,
        joinedThisMonthCount: 1,
        pausedThisMonthCount: 0,
        withdrawnThisMonthCount: 0,
      },
      currentFinance: {
        status: "available",
        blockedReason: null,
        source: "current",
        summary: {
          billedTotal: 600000,
          actualFeeIncome: 510000,
          expenseTotal: 130000,
          attributedNet: 380000,
          fullyPaidCount: 17,
          feeTargetCount: 20,
          unpaidCount: 3,
          unpaidTotal: 90000,
          openingLedgerBalance: 395000,
          closingLedgerBalance: 775000,
        },
        activeFinal: null,
        latestInterim: {
          id: interimClosingId,
          closingKind: "interim",
          version: 2,
          status: "closed",
        },
      },
      latestFinal: {
        id: finalClosingId,
        closingKind: "final",
        version: 1,
        status: "closed",
        periodMonth: "2026-07-01",
        closedAt: "2026-07-31T00:00:00.000Z",
        billedTotal: 600000,
        actualFeeIncome: 510000,
        expenseTotal: 130000,
        attributedNet: 380000,
        fullyPaidCount: 17,
        feeTargetCount: 20,
        unpaidCount: 3,
        unpaidTotal: 90000,
        openingLedgerBalance: 0,
        closingLedgerBalance: 380000,
      },
      trends: [
        {
          periodMonth: "2026-07-01",
          source: "final",
          actualFeeIncome: 510000,
          expenseTotal: 130000,
          closingLedgerBalance: 380000,
        },
        {
          periodMonth: "2026-08-01",
          source: "current",
          actualFeeIncome: 510000,
          expenseTotal: 130000,
          closingLedgerBalance: 775000,
        },
      ],
    });
  });

  it("maps a blocked finance payload without a summary", () => {
    const page = parseDashboardPage(
      databasePage({
        current_finance: {
          status: "blocked",
          blocked_reason: "prior-final-closing-required",
          source: null,
          summary: null,
          active_final: null,
          latest_interim: interimReference(),
        },
        trends: [{
          period_month: "2026-07-01",
          source: "final",
          actual_fee_income: 510000,
          expense_total: 130000,
          closing_ledger_balance: 380000,
        }],
      }),
    );

    expect(page.currentFinance).toEqual({
      status: "blocked",
      blockedReason: "prior-final-closing-required",
      source: null,
      summary: null,
      activeFinal: null,
      latestInterim: {
        id: interimClosingId,
        closingKind: "interim",
        version: 2,
        status: "closed",
      },
    });
  });

  it.each([
    ["a negative member count", () => databasePage({
      members: { ...databasePage().members, active_count: -1 },
    })],
    ["a negative payment count", () => databasePage({
      current_finance: {
        ...databasePage().current_finance,
        summary: databaseSummary({ unpaid_count: -1 }),
      },
    })],
    ["unreconciled fee payment counts", () => databasePage({
      current_finance: {
        ...databasePage().current_finance,
        summary: databaseSummary({ fully_paid_count: 18 }),
      },
    })],
    ["an incorrect attributed net", () => databasePage({
      current_finance: {
        ...databasePage().current_finance,
        summary: databaseSummary({ attributed_net: 380001 }),
      },
    })],
    ["an incorrect closing ledger balance", () => databasePage({
      current_finance: {
        ...databasePage().current_finance,
        summary: databaseSummary({ closing_ledger_balance: 775001 }),
      },
    })],
    ["a period month that is not the first day", () => databasePage({
      period_month: "2026-08-02",
    })],
    ["a duplicate trend month", () => databasePage({
      trends: [
        databasePage().trends[0],
        databasePage().trends[0],
      ],
    })],
    ["descending trend months", () => databasePage({
      trends: [
        {
          ...databasePage().trends[1],
          source: "final",
        },
        databasePage().trends[0],
      ],
    })],
    ["a trend before the first ledger month", () => databasePage({
      trends: [{
        ...databasePage().trends[0],
        period_month: "2026-06-01",
      }],
    })],
    ["a current trend outside the payload period", () => databasePage({
      trends: [{
        ...databasePage().trends[0],
        source: "current",
      }],
    })],
    ["a blocked finance result with a summary", () => databasePage({
      current_finance: {
        status: "blocked",
        blocked_reason: "member-activity-start-required",
        source: null,
        summary: databaseSummary(),
        active_final: null,
        latest_interim: null,
      },
    })],
    ["an available finance result without a summary", () => databasePage({
      current_finance: {
        status: "available",
        blocked_reason: null,
        source: "current",
        summary: null,
        active_final: null,
        latest_interim: null,
      },
    })],
    ["more than six trends", () => databasePage({
      period_month: "2027-01-01",
      trends: [
        "2026-07-01",
        "2026-08-01",
        "2026-09-01",
        "2026-10-01",
        "2026-11-01",
        "2026-12-01",
        "2027-01-01",
      ].map((period_month) => ({
        period_month,
        source: period_month === "2027-01-01" ? "current" : "final",
        actual_fee_income: 510000,
        expense_total: 130000,
        closing_ledger_balance: 380000,
      })),
    })],
    ["a latest closing that is not final", () => databasePage({
      latest_final: {
        ...databasePage().latest_final,
        closing_kind: "interim",
      },
    })],
    ["a non-aggregate field", () => databasePage({
      members: { ...databasePage().members, actor_display_name: "운영자" },
    })],
  ])("rejects %s", (_, payload) => {
    expect(() => parseDashboardPage(payload())).toThrow(
      "대시보드 데이터 형식이 올바르지 않습니다.",
    );
  });
});
