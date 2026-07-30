import {
  formatCurrency,
  formatExpenseCategory,
  formatPeriodMonth,
} from "@/features/settlements/settlement-summary";
import type {
  MonthlySettlementClosing,
  MonthlySettlementExpenseCategoryRow,
} from "@/features/settlements/settlement-snapshot";
import {
  getCurrentPeriodMonth,
  normalizePeriodMonth,
} from "@/features/fees/fee-model";
import { firstSearchParam } from "@/features/members/member-list";

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

export function buildMonthlyReportData(input: {
  closing: MonthlySettlementClosing;
  generatedAt: Date;
  generatedBy: string;
}): MonthlyReportData {
  const { closing } = input;
  const snapshot = closing.snapshot;

  return {
    title: formatReportTitle(snapshot.periodMonth),
    periodLabel: formatPeriodMonth(snapshot.periodMonth),
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

  return `${year}년 ${month}월 테니스 클럽 월간 정산 보고서`;
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

export function formatReportFileName(periodMonth: string) {
  return `jw-tennis-club-${periodMonth.slice(0, 7)}-report.pdf`;
}

export { formatCurrency, formatPeriodMonth };
