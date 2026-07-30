import { describe, expect, it } from "vitest";
import type { MonthlySettlementClosing } from "@/features/settlements/settlement-snapshot";
import {
  buildMonthlyReportData,
  formatReportFileName,
  normalizeReportFilters,
} from "./monthly-report";

const closing: MonthlySettlementClosing = {
  id: "f0331b6c-99e0-4d6b-ab47-6e0d3ae57c00",
  periodMonth: "2026-07-01",
  version: 2,
  status: "closed",
  closedAt: "2026-08-02T03:04:05.000Z",
  closedBy: "김마감",
  snapshot: {
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
      { category: "court", amount: 120000, count: 1 },
      { category: "balls", amount: 10000, count: 1 },
    ],
    expenseRows: [
      {
        expenseDate: "2026-07-12",
        category: "court",
        description: "코트 대관",
        amount: 120000,
      },
      {
        expenseDate: "2026-07-18",
        category: "balls",
        description: "시합구",
        amount: 10000,
      },
    ],
  },
};

describe("normalizeReportFilters", () => {
  it("normalizes a report month query to the first day of the month", () => {
    expect(normalizeReportFilters({ month: "2026-07" }, "2026-08-01")).toEqual({
      periodMonth: "2026-07-01",
    });
  });

  it("falls back when the report month is invalid", () => {
    expect(normalizeReportFilters({ month: "invalid" }, "2026-07-01")).toEqual({
      periodMonth: "2026-07-01",
    });
  });
});

describe("buildMonthlyReportData", () => {
  it("maps only immutable closing metadata and the public snapshot", () => {
    const report = buildMonthlyReportData({
      closing,
      generatedAt: new Date("2026-08-03T12:00:00Z"),
      generatedBy: "김생성",
    });

    expect(report).toEqual({
      title: "2026년 7월 테니스 클럽 월간 정산 보고서",
      periodLabel: "2026.07",
      closingVersion: 2,
      closedAtLabel: "2026.08.02",
      closedBy: "김마감",
      generatedAtLabel: "2026.08.03",
      generatedBy: "김생성",
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
        { category: "court", amount: 120000, count: 1 },
        { category: "balls", amount: 10000, count: 1 },
      ],
      expenseRows: [
        {
          expenseDate: "2026.07.12",
          categoryLabel: "코트",
          description: "코트 대관",
          amount: 120000,
        },
        {
          expenseDate: "2026.07.18",
          categoryLabel: "공",
          description: "시합구",
          amount: 10000,
        },
      ],
    });
  });

  it("does not expose private member, payment, receipt, or memo data", () => {
    const report = buildMonthlyReportData({
      closing,
      generatedAt: new Date("2026-08-03T12:00:00Z"),
      generatedBy: "김생성",
    });

    expect(report).not.toHaveProperty("memberName");
    expect(report).not.toHaveProperty("memberCode");
    expect(report).not.toHaveProperty("feePayments");
    expect(report).not.toHaveProperty("receipt");
    expect(report).not.toHaveProperty("memo");
  });
});

describe("formatReportFileName", () => {
  it("uses the report month in a stable filename", () => {
    expect(formatReportFileName("2026-07-01")).toBe(
      "jw-tennis-club-2026-07-report.pdf",
    );
  });
});
