import {
  formatCurrency,
  formatExpenseCategory,
  type SettlementExpenseCategoryRow,
} from "@/features/settlements/settlement-summary";
import {
  buildSettlementSummary,
  formatPeriodMonth,
} from "@/features/settlements/settlement-summary";
import {
  getCurrentPeriodMonth,
  normalizePeriodMonth,
} from "@/features/fees/fee-model";
import { type ExpenseCategory } from "@/features/expenses/expense-model";
import { firstSearchParam } from "@/features/members/member-list";

export type ReportSearchParams = {
  month?: string | string[];
};

export type ReportFilters = {
  periodMonth: string;
};

export type MonthlyReportFeePaymentInput = {
  amount: number;
};

export type MonthlyReportExpenseInput = {
  amount: number;
  category: ExpenseCategory;
  description: string;
  expenseDate: string;
  memo: string | null;
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
  generatedAtLabel: string;
  generatedBy: string;
  incomeTotal: number;
  expenseTotal: number;
  attributedNet: number;
  feePaymentCount: number;
  expenseCount: number;
  expenseCategoryRows: SettlementExpenseCategoryRow[];
  majorExpenseRows: MonthlyReportExpenseRow[];
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
  periodMonth: string;
  generatedAt: Date;
  generatedBy: string;
  feePayments: MonthlyReportFeePaymentInput[];
  expenses: MonthlyReportExpenseInput[];
}): MonthlyReportData {
  const settlement = buildSettlementSummary({
    feePayments: input.feePayments,
    expenses: input.expenses,
  });

  return {
    title: formatReportTitle(input.periodMonth),
    periodLabel: formatPeriodMonth(input.periodMonth),
    generatedAtLabel: formatDateLabel(input.generatedAt),
    generatedBy: input.generatedBy,
    incomeTotal: settlement.incomeTotal,
    expenseTotal: settlement.expenseTotal,
    attributedNet: settlement.attributedNet,
    feePaymentCount: settlement.feePaymentCount,
    expenseCount: settlement.expenseCount,
    expenseCategoryRows: settlement.expenseCategoryRows,
    majorExpenseRows: input.expenses.map((expense) => ({
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

function formatDateLabel(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}.${month}.${day}`;
}

export function formatReportFileName(periodMonth: string) {
  return `jw-tennis-club-${periodMonth.slice(0, 7)}-report.pdf`;
}

export { formatCurrency, formatPeriodMonth };
