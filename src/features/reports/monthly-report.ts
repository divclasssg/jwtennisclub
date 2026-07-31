import {
  formatCurrency,
  formatExpenseCategory,
  formatPeriodMonth,
} from "@/features/settlements/settlement-summary";
import {
  getCurrentPeriodMonth,
  normalizePeriodMonth,
} from "@/features/fees/fee-model";
import { firstSearchParam } from "@/features/members/member-list";
import type {
  MonthlySettlementClosing,
  MonthlySettlementClosingKind,
  MonthlySettlementClosingStatus,
  MonthlySettlementExpenseCategoryRow,
} from "@/features/settlements/settlement-snapshot";
import { z } from "zod";

const reportSnapshotIdSchema = z.string().uuid();

export type ReportSearchParams = {
  month?: string | string[];
};

export type ReportFilters = {
  periodMonth: string;
};

export type MonthlyReportExpenseRow = {
  expenseDate: string;
  categoryLabel: string;
  description: string;
  amount: number;
};

export type MonthlyReportData = {
  title: string;
  periodLabel: string;
  closingKind: MonthlySettlementClosingKind;
  closingStatus: MonthlySettlementClosingStatus;
  closingLabel: string;
  closingVersion: number;
  closedAtLabel: string;
  closedBy: string;
  generatedAtLabel: string;
  generatedBy: string;
  activityMemberCount: number;
  feeTargetCount: number;
  fullyPaidCount: number;
  unpaidCount: number;
  billedTotal: number;
  actualFeeIncome: number;
  recognizedPaidTotal: number;
  adjustmentIncome: number;
  unpaidTotal: number;
  expenseTotal: number;
  expenseCount: number;
  attributedNet: number;
  openingLedgerBalance: number;
  closingLedgerBalance: number;
  expenseCategoryRows: MonthlySettlementExpenseCategoryRow[];
  expenseRows: MonthlyReportExpenseRow[];
};

export function normalizeReportFilters(
  params: ReportSearchParams,
  fallbackMonth = getCurrentPeriodMonth(),
): ReportFilters {
  return {
    periodMonth:
      normalizePeriodMonth(firstSearchParam(params.month)) || fallbackMonth,
  };
}

export function normalizeReportSnapshotId(
  value: string | string[] | undefined,
) {
  if (typeof value !== "string") return null;

  const result = reportSnapshotIdSchema.safeParse(value);
  return result.success ? result.data.toLowerCase() : null;
}

export function buildMonthlyReportData(input: {
  closing: MonthlySettlementClosing;
  generatedAt: Date;
  generatedBy: string;
}): MonthlyReportData {
  const { closing } = input;
  const snapshot = closing.snapshot;
  const kindLabel =
    closing.closingKind === "interim" ? "중간 결산" : "최종 마감";
  const stateLabel =
    closing.status === "reopened" ? " · 재개됨" : "";
  const closingLabel = `${kindLabel} v${closing.version}${stateLabel}`;

  return {
    title: formatReportTitle(snapshot.periodMonth),
    periodLabel: formatPeriodMonth(snapshot.periodMonth),
    closingKind: closing.closingKind,
    closingStatus: closing.status,
    closingLabel,
    closingVersion: closing.version,
    closedAtLabel: formatSeoulDateLabel(new Date(closing.closedAt)),
    closedBy: closing.closedBy,
    generatedAtLabel: formatSeoulDateLabel(input.generatedAt),
    generatedBy: input.generatedBy,
    activityMemberCount: snapshot.activityMemberCount,
    feeTargetCount: snapshot.feeTargetCount,
    fullyPaidCount: snapshot.fullyPaidCount,
    unpaidCount: snapshot.unpaidCount,
    billedTotal: snapshot.billedTotal,
    actualFeeIncome: snapshot.actualFeeIncome,
    recognizedPaidTotal: snapshot.recognizedPaidTotal,
    adjustmentIncome: snapshot.adjustmentIncome,
    unpaidTotal: snapshot.unpaidTotal,
    expenseTotal: snapshot.expenseTotal,
    expenseCount: snapshot.expenseCount,
    attributedNet: snapshot.attributedNet,
    openingLedgerBalance: snapshot.openingLedgerBalance,
    closingLedgerBalance: snapshot.closingLedgerBalance,
    expenseCategoryRows: snapshot.expenseCategoryRows.map((row) => ({ ...row })),
    expenseRows: snapshot.expenseRows.map((expense) => ({
      expenseDate: expense.expenseDate.replaceAll("-", "."),
      categoryLabel: formatExpenseCategory(expense.category),
      description: expense.description,
      amount: expense.amount,
    })),
  };
}

function formatReportTitle(periodMonth: string) {
  const [year, month] = periodMonth.split("-").map(Number);

  return `${year}년 ${month}월 테니스 클럽 월간 결산 보고서`;
}

function formatSeoulDateLabel(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});

  return `${parts.year}.${parts.month}.${parts.day}`;
}

export function formatReportFileName(
  periodMonth: string,
  kind: MonthlySettlementClosingKind,
  version: number,
) {
  return `jw-tennis-club-${periodMonth.slice(0, 7)}-${kind}-v${version}.pdf`;
}

export { formatCurrency, formatPeriodMonth };
