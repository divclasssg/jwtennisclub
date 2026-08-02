import { describe, expect, it } from "vitest";
import type { MonthlySettlementClosing } from "@/features/settlements/settlement-snapshot";
import {
  buildMonthlyReportData,
  formatReportFileName,
  normalizeReportSnapshotId,
} from "./monthly-report";

const interimClosing: MonthlySettlementClosing = {
  id: "f0331b6c-99e0-4d6b-ab47-6e0d3ae57c00",
  periodMonth: "2026-07-01",
  closingKind: "interim",
  version: 1,
  status: "closed",
  closedAt: "2026-08-02T03:04:05.000Z",
  closedBy: "김마감",
  reopenedAt: null,
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

const reopenedFinalClosing: MonthlySettlementClosing = {
  ...interimClosing,
  id: "a0331b6c-99e0-4d6b-ab47-6e0d3ae57c00",
  closingKind: "final",
  version: 2,
  status: "reopened",
  reopenedAt: "2026-08-03T03:04:05.000Z",
};

describe("normalizeReportSnapshotId", () => {
  it("accepts one exact UUID snapshot identity", () => {
    expect(normalizeReportSnapshotId(interimClosing.id)).toBe(interimClosing.id);
  });

  it("canonicalizes an uppercase UUID to PostgreSQL lowercase form", () => {
    expect(normalizeReportSnapshotId(interimClosing.id.toUpperCase())).toBe(
      interimClosing.id,
    );
  });

  it.each([
    ["an array", [interimClosing.id]],
    ["a missing value", undefined],
    ["a blank value", "  "],
    ["an invalid UUID", "not-a-uuid"],
  ])("rejects %s", (_, value) => {
    expect(normalizeReportSnapshotId(value)).toBeNull();
  });
});

describe("buildMonthlyReportData", () => {
  it("labels an immutable interim closing and maps only its public snapshot", () => {
    const report = buildMonthlyReportData({
      closing: interimClosing,
      generatedAt: new Date("2026-08-03T12:00:00Z"),
      generatedBy: "김생성",
    });

    expect(report).toEqual({
      title: "2026년 7월 테니스 클럽 월간 결산 보고서",
      periodLabel: "2026.07",
      closingKind: "interim",
      closingStatus: "closed",
      closingLabel: "중간 결산 v1",
      closingVersion: 1,
      closedAtLabel: "2026.08.02 12:04:05",
      closedBy: "김마감",
      generatedAtLabel: "2026.08.03 21:00:00",
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

    expect(report.title).toContain("월간 결산 보고서");
    expect(report.closingLabel).toBe("중간 결산 v1");
  });

  it("labels a reopened final closing without changing its exact snapshot", () => {
    const reopenedReport = buildMonthlyReportData({
      closing: reopenedFinalClosing,
      generatedAt: new Date("2026-08-03T12:00:00Z"),
      generatedBy: "김생성",
    });

    expect(reopenedReport.closingKind).toBe("final");
    expect(reopenedReport.closingStatus).toBe("reopened");
    expect(reopenedReport.closingLabel).toBe("최종 마감 v2 · 재개됨");
  });

  it("keeps same-day closing and PDF generation times distinguishable in Seoul", () => {
    const report = buildMonthlyReportData({
      closing: {
        ...interimClosing,
        closedAt: "2026-08-02T03:04:05.000Z",
      },
      generatedAt: new Date("2026-08-02T03:04:06.000Z"),
      generatedBy: "김생성",
    });

    expect(report.closedAtLabel).toBe("2026.08.02 12:04:05");
    expect(report.generatedAtLabel).toBe("2026.08.02 12:04:06");
  });

  it("does not expose private member, payment, receipt, or memo data", () => {
    const report = buildMonthlyReportData({
      closing: interimClosing,
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
  it("identifies an interim closing by kind and version", () => {
    expect(formatReportFileName("2026-07-01", "interim", 1)).toBe(
      "jw-tennis-club-2026-07-interim-v1.pdf",
    );
  });

  it("identifies a final closing by kind and version", () => {
    expect(formatReportFileName("2026-07-01", "final", 2)).toBe(
      "jw-tennis-club-2026-07-final-v2.pdf",
    );
  });
});
