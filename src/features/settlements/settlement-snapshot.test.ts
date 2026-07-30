import { describe, expect, it } from "vitest";
import {
  canDownloadMonthlyReport,
  parseMonthlySettlementPage,
  type MonthlySettlementSnapshot,
} from "./settlement-snapshot";

const closingId = "a2d6d2a4-6d59-4ad4-b21a-cd259d83c715";

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
      id: closingId,
      period_month: "2026-07-01",
      version: 2,
      status: "closed",
      snapshot: databaseSnapshot(),
      closed_at: "2026-08-02T03:04:05+00:00",
      closed_by: "김마감",
    },
    can_close: true,
    can_reopen: false,
    close_blocked_reason: null,
    ...overrides,
  };
}

describe("monthly settlement page parser", () => {
  it("maps a valid database response to a camelCase page DTO", () => {
    expect(parseMonthlySettlementPage(databasePage())).toEqual({
      preview: validSnapshot(),
      activeClosing: {
        id: closingId,
        periodMonth: "2026-07-01",
        version: 2,
        status: "closed",
        snapshot: validSnapshot(),
        closedAt: "2026-08-02T03:04:05+00:00",
        closedBy: "김마감",
      },
      canClose: true,
      canReopen: false,
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

  it("rejects a closing whose month or snapshot does not match the preview month", () => {
    expect(() =>
      parseMonthlySettlementPage(
        databasePage({
          active_closing: {
            ...databasePage().active_closing,
            period_month: "2026-08-01",
          },
        }),
      ),
    ).toThrow("월별 정산 데이터 형식이 올바르지 않습니다.");
  });
});

describe("monthly report download eligibility", () => {
  it("allows download from exactly midnight on the first day of the following Seoul month", () => {
    expect(
      canDownloadMonthlyReport(
        "2026-07-01",
        new Date("2026-08-01T00:00:00+09:00"),
      ),
    ).toBe(true);
  });

  it("blocks download one second before the following Seoul month", () => {
    expect(
      canDownloadMonthlyReport(
        "2026-07-01",
        new Date("2026-07-31T23:59:59+09:00"),
      ),
    ).toBe(false);
  });

  it("rejects malformed period months instead of guessing an eligibility date", () => {
    expect(
      canDownloadMonthlyReport("2026-07-12", new Date("2026-08-02T00:00:00+09:00")),
    ).toBe(false);
  });
});
