import { describe, expect, it } from "vitest";
import {
  parseMonthlySettlementClosing,
  parseMonthlySettlementPage,
  type MonthlySettlementSnapshot,
} from "./settlement-snapshot";

const activeClosingId = "11111111-1111-4111-8111-111111111111";
const interimClosingId = "22222222-2222-4222-8222-222222222222";

function validSnapshot(): MonthlySettlementSnapshot {
  return {
    schemaVersion: 1,
    periodMonth: "2026-07-01",
    monthlyFeeAmount: 30000,
    activityMemberCount: 21,
    feeTargetCount: 20,
    fullyPaidCount: 17,
    unpaidCount: 3,
    billedTotal: 600000,
    actualFeeIncome: 525000,
    recognizedPaidTotal: 510000,
    adjustmentIncome: 15000,
    unpaidTotal: 90000,
    expenseTotal: 130000,
    expenseCount: 2,
    attributedNet: 395000,
    openingLedgerBalance: 0,
    closingLedgerBalance: 395000,
    expenseCategoryRows: [
      { category: "court", count: 1, amount: 120000 },
      { category: "balls", count: 1, amount: 10000 },
    ],
    expenseRows: [
      {
        expenseDate: "2026-07-12",
        category: "court",
        description: "코트 대관",
        amount: 120000,
      },
      {
        expenseDate: "2026-07-20",
        category: "balls",
        description: "테니스 공 구매",
        amount: 10000,
      },
    ],
  };
}

function databaseSnapshot(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const snapshot = validSnapshot();

  return {
    schema_version: snapshot.schemaVersion,
    period_month: snapshot.periodMonth,
    monthly_fee_amount: snapshot.monthlyFeeAmount,
    activity_member_count: snapshot.activityMemberCount,
    fee_target_count: snapshot.feeTargetCount,
    fully_paid_count: snapshot.fullyPaidCount,
    unpaid_count: snapshot.unpaidCount,
    billed_total: snapshot.billedTotal,
    actual_fee_income: snapshot.actualFeeIncome,
    recognized_paid_total: snapshot.recognizedPaidTotal,
    adjustment_income: snapshot.adjustmentIncome,
    unpaid_total: snapshot.unpaidTotal,
    expense_total: snapshot.expenseTotal,
    expense_count: snapshot.expenseCount,
    attributed_net: snapshot.attributedNet,
    opening_ledger_balance: snapshot.openingLedgerBalance,
    closing_ledger_balance: snapshot.closingLedgerBalance,
    expense_category_rows: snapshot.expenseCategoryRows.map((row) => ({
      category: row.category,
      count: row.count,
      amount: row.amount,
    })),
    expense_rows: snapshot.expenseRows.map((row) => ({
      expense_date: row.expenseDate,
      category: row.category,
      description: row.description,
      amount: row.amount,
    })),
    ...overrides,
  };
}

function databasePage(overrides: Record<string, unknown> = {}) {
  return {
    preview: databaseSnapshot(),
    active_closing: {
      id: activeClosingId,
      period_month: "2026-07-01",
      closing_kind: "final",
      version: 1,
      status: "closed",
      snapshot: databaseSnapshot(),
      closed_at: "2026-07-31T00:00:00.000Z",
      closed_by: "박세익",
      reopened_at: null,
    },
    closing_history: [
      {
        id: interimClosingId,
        period_month: "2026-07-01",
        closing_kind: "interim",
        version: 2,
        status: "closed",
        snapshot: databaseSnapshot(),
        closed_at: "2026-07-30T00:00:00.000Z",
        closed_by: "박세익",
        reopened_at: null,
      },
    ],
    can_create_interim: false,
    can_close: false,
    can_reopen: true,
    close_blocked_reason: null,
    ...overrides,
  };
}

describe("monthly settlement page parser", () => {
  it("maps a valid database response to a camelCase page DTO", () => {
    expect(parseMonthlySettlementPage(databasePage())).toEqual({
      preview: validSnapshot(),
      activeClosing: {
        id: activeClosingId,
        periodMonth: "2026-07-01",
        closingKind: "final",
        version: 1,
        status: "closed",
        snapshot: validSnapshot(),
        closedAt: "2026-07-31T00:00:00.000Z",
        closedBy: "박세익",
        reopenedAt: null,
      },
      closingHistory: [
        {
          id: interimClosingId,
          periodMonth: "2026-07-01",
          closingKind: "interim",
          version: 2,
          status: "closed",
          snapshot: validSnapshot(),
          closedAt: "2026-07-30T00:00:00.000Z",
          closedBy: "박세익",
          reopenedAt: null,
        },
      ],
      canCreateInterim: false,
      canClose: false,
      canReopen: true,
      closeBlockedReason: null,
    });
  });

  it.each([
    ["an unsupported schema version", { schema_version: 2 }],
    ["a negative member count", { activity_member_count: -1 }],
    ["inconsistent fee target counts", { fully_paid_count: 18 }],
    ["an incorrect billed total", { billed_total: 600001 }],
    ["an incorrect actual fee income", { actual_fee_income: 525001 }],
    ["an incorrect attributed net", { attributed_net: 395001 }],
    ["an incorrect closing ledger balance", { closing_ledger_balance: 395001 }],
    ["expense categories that do not reconcile", {
      expense_category_rows: [
        { category: "court", count: 1, amount: 120000 },
        { category: "balls", count: 1, amount: 9999 },
      ],
    }],
  ])("rejects %s", (_, snapshotOverrides) => {
    expect(() =>
      parseMonthlySettlementPage(
        databasePage({ preview: databaseSnapshot(snapshotOverrides) }),
      ),
    ).toThrow("월별 정산 데이터 형식이 올바르지 않습니다.");
  });

  it("rejects a malformed settlement month", () => {
    expect(() =>
      parseMonthlySettlementPage(
        databasePage({ preview: databaseSnapshot({ period_month: "2026-07-12" }) }),
      ),
    ).toThrow("월별 정산 데이터 형식이 올바르지 않습니다.");
  });

  it("rejects snapshot shapes that contain prohibited personal or internal data", () => {
    expect(() =>
      parseMonthlySettlementPage(
        databasePage({
          preview: databaseSnapshot({ member_name: "홍길동" }),
        }),
      ),
    ).toThrow("월별 정산 데이터 형식이 올바르지 않습니다.");

    expect(() =>
      parseMonthlySettlementPage(
        databasePage({
          preview: databaseSnapshot({
            expense_rows: [
              {
                expense_date: "2026-07-12",
                category: "court",
                description: "코트 대관",
                amount: 120000,
                receipt_file_key: "private/receipt.png",
              },
              {
                expense_date: "2026-07-20",
                category: "balls",
                description: "테니스 공 구매",
                amount: 10000,
              },
            ],
          }),
        }),
      ),
    ).toThrow("월별 정산 데이터 형식이 올바르지 않습니다.");
  });

  it("rejects a closing whose snapshot month does not match the preview month", () => {
    expect(() =>
      parseMonthlySettlementPage(
        databasePage({
          closing_history: [
            {
              ...databasePage().closing_history[0],
              snapshot: databaseSnapshot({
                period_month: "2026-08-01",
                expense_rows: [
                  {
                    expense_date: "2026-08-12",
                    category: "court",
                    description: "코트 대관",
                    amount: 120000,
                  },
                  {
                    expense_date: "2026-08-20",
                    category: "balls",
                    description: "테니스 공 구매",
                    amount: 10000,
                  },
                ],
              }),
            },
          ],
        }),
      ),
    ).toThrow("월별 정산 데이터 형식이 올바르지 않습니다.");
  });

  it("rejects an interim closing that was reopened", () => {
    expect(() =>
      parseMonthlySettlementPage(
        databasePage({
          closing_history: [
            {
              ...databasePage().closing_history[0],
              status: "reopened",
              reopened_at: "2026-07-30T01:00:00.000Z",
            },
          ],
        }),
      ),
    ).toThrow("월별 정산 데이터 형식이 올바르지 않습니다.");
  });

  it("rejects an active closing that is not final and closed", () => {
    expect(() =>
      parseMonthlySettlementPage(
        databasePage({
          active_closing: {
            ...databasePage().active_closing,
            closing_kind: "interim",
          },
        }),
      ),
    ).toThrow("월별 정산 데이터 형식이 올바르지 않습니다.");
  });

  it("rejects closing history with duplicate kind and version pairs", () => {
    expect(() =>
      parseMonthlySettlementPage(
        databasePage({
          closing_history: [
            databasePage().closing_history[0],
            {
              ...databasePage().closing_history[0],
              id: "33333333-3333-4333-8333-333333333333",
              closed_at: "2026-07-29T00:00:00.000Z",
            },
          ],
        }),
      ),
    ).toThrow("월별 정산 데이터 형식이 올바르지 않습니다.");
  });

  it("rejects closing history that is not ordered newest first", () => {
    expect(() =>
      parseMonthlySettlementPage(
        databasePage({
          closing_history: [
            {
              ...databasePage().closing_history[0],
              closed_at: "2026-07-29T00:00:00.000Z",
            },
            {
              ...databasePage().closing_history[0],
              id: "33333333-3333-4333-8333-333333333333",
              version: 3,
              closed_at: "2026-07-30T00:00:00.000Z",
            },
          ],
        }),
      ),
    ).toThrow("월별 정산 데이터 형식이 올바르지 않습니다.");
  });

  it("rejects a page that allows closing an already closed month", () => {
    expect(() =>
      parseMonthlySettlementPage(databasePage({ can_close: true })),
    ).toThrow("월별 정산 데이터 형식이 올바르지 않습니다.");
  });

  it("rejects a page that allows an interim closing after final closing", () => {
    expect(() =>
      parseMonthlySettlementPage(databasePage({ can_create_interim: true })),
    ).toThrow("월별 정산 데이터 형식이 올바르지 않습니다.");
  });

  it("rejects a page that allows reopening without an active closing", () => {
    expect(() =>
      parseMonthlySettlementPage(
        databasePage({
          active_closing: null,
          can_close: true,
          can_reopen: true,
        }),
      ),
    ).toThrow("월별 정산 데이터 형식이 올바르지 않습니다.");
  });

  it("rejects settlement snapshots before the July 2026 ledger start", () => {
    expect(() =>
      parseMonthlySettlementPage(
        databasePage({
          preview: databaseSnapshot({ period_month: "2026-06-01" }),
          active_closing: null,
          can_close: true,
        }),
      ),
    ).toThrow("월별 정산 데이터 형식이 올바르지 않습니다.");
  });

  it("requires July 2026 to start from a zero ledger balance", () => {
    expect(() =>
      parseMonthlySettlementPage(
        databasePage({
          preview: databaseSnapshot({
            opening_ledger_balance: 1,
            closing_ledger_balance: 395001,
          }),
          active_closing: null,
          can_close: true,
        }),
      ),
    ).toThrow("월별 정산 데이터 형식이 올바르지 않습니다.");
  });

  it("rejects expense rows outside the snapshot month", () => {
    expect(() =>
      parseMonthlySettlementPage(
        databasePage({
          preview: databaseSnapshot({
            expense_rows: [
              {
                expense_date: "2026-08-01",
                category: "court",
                description: "코트 대관",
                amount: 120000,
              },
              {
                expense_date: "2026-07-20",
                category: "balls",
                description: "테니스 공 구매",
                amount: 10000,
              },
            ],
          }),
          active_closing: null,
          can_close: true,
        }),
      ),
    ).toThrow("월별 정산 데이터 형식이 올바르지 않습니다.");
  });

  it("rejects numeric values beyond JavaScript's safe integer range", () => {
    expect(() =>
      parseMonthlySettlementPage(
        databasePage({
          preview: databaseSnapshot({
            activity_member_count: Number.MAX_SAFE_INTEGER + 1,
          }),
          active_closing: null,
          can_close: true,
        }),
      ),
    ).toThrow("월별 정산 데이터 형식이 올바르지 않습니다.");
  });
});

describe("monthly settlement closing parser", () => {
  it("rejects a closing whose outer and snapshot months differ", () => {
    expect(() =>
      parseMonthlySettlementClosing({
        ...databasePage().closing_history[0],
        period_month: "2026-08-01",
      }),
    ).toThrow("월별 정산 데이터 형식이 올바르지 않습니다.");
  });
});

describe("monthly report download eligibility", () => {
  it("represents same-day download eligibility with a valid active closing identity", () => {
    expect(parseMonthlySettlementPage(databasePage()).activeClosing?.id).toBe(
      activeClosingId,
    );
  });
});
