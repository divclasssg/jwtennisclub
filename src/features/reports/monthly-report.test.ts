import { describe, expect, it } from "vitest";
import {
  buildMonthlyReportData,
  formatReportFileName,
  normalizeReportFilters,
} from "./monthly-report";

describe("normalizeReportFilters", () => {
  it("normalizes a report month query to the first day of the month", () => {
    expect(normalizeReportFilters({ month: "2026-06" }, "2026-07-01")).toEqual({
      periodMonth: "2026-06-01",
    });
  });

  it("falls back when the report month is invalid", () => {
    expect(normalizeReportFilters({ month: "invalid" }, "2026-07-01")).toEqual({
      periodMonth: "2026-07-01",
    });
  });
});

describe("buildMonthlyReportData", () => {
  it("builds a member-facing report without individual payment details or internal memos", () => {
    const report = buildMonthlyReportData({
      periodMonth: "2026-06-01",
      generatedAt: new Date("2026-07-05T12:00:00Z"),
      generatedBy: "김운영",
      feePayments: [{ amount: 30000 }, { amount: 50000 }],
      expenses: [
        {
          amount: 120000,
          category: "court",
          description: "코트 대관",
          expenseDate: "2026-06-12",
          memo: "운영진 확인용",
        },
        {
          amount: 10000,
          category: "balls",
          description: "시합구",
          expenseDate: "2026-06-18",
          memo: null,
        },
      ],
    });

    expect(report).toEqual({
      title: "2026년 6월 테니스 클럽 월간 정산 보고서",
      periodLabel: "2026.06",
      generatedAtLabel: "2026.07.05",
      generatedBy: "김운영",
      incomeTotal: 80000,
      expenseTotal: 130000,
      attributedNet: -50000,
      feePaymentCount: 2,
      expenseCount: 2,
      expenseCategoryRows: [
        { category: "court", amount: 120000, count: 1 },
        { category: "balls", amount: 10000, count: 1 },
      ],
      majorExpenseRows: [
        {
          expenseDate: "2026.06.12",
          categoryLabel: "코트",
          description: "코트 대관",
          amount: 120000,
        },
        {
          expenseDate: "2026.06.18",
          categoryLabel: "공",
          description: "시합구",
          amount: 10000,
        },
      ],
    });
  });
});

describe("formatReportFileName", () => {
  it("uses the report month in a stable Korean filename", () => {
    expect(formatReportFileName("2026-06-01")).toBe(
      "jw-tennis-club-2026-06-report.pdf",
    );
  });
});
