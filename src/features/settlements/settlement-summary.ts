import {
  EXPENSE_CATEGORIES,
  formatExpenseCategory,
  type ExpenseCategory,
} from "@/features/expenses/expense-model";
import {
  formatCurrency,
  formatPeriodMonth,
  getCurrentPeriodMonth,
  normalizePeriodMonth,
} from "@/features/fees/fee-model";
import { firstSearchParam } from "@/features/members/member-list";

export type SettlementSearchParams = {
  month?: string | string[];
  sort?: string | string[];
  direction?: string | string[];
};

export type SettlementFilters = {
  periodMonth: string;
};

export type SettlementFeePaymentInput = {
  amount: number;
};

export type SettlementExpenseInput = {
  amount: number;
  category: ExpenseCategory;
};

export type SettlementExpenseCategoryRow = {
  category: ExpenseCategory;
  amount: number;
  count: number;
};

export type SettlementSummary = {
  incomeTotal: number;
  expenseTotal: number;
  attributedNet: number;
  feePaymentCount: number;
  expenseCount: number;
  expenseCategoryRows: SettlementExpenseCategoryRow[];
};

export function normalizeSettlementFilters(
  params: SettlementSearchParams,
  fallbackMonth = getCurrentPeriodMonth(),
): SettlementFilters {
  return {
    periodMonth:
      normalizePeriodMonth(firstSearchParam(params.month)) || fallbackMonth,
  };
}

export function buildSettlementSummary(input: {
  feePayments: SettlementFeePaymentInput[];
  expenses: SettlementExpenseInput[];
}): SettlementSummary {
  const incomeTotal = input.feePayments.reduce(
    (total, payment) => total + payment.amount,
    0,
  );
  const expenseTotal = input.expenses.reduce(
    (total, expense) => total + expense.amount,
    0,
  );

  return {
    incomeTotal,
    expenseTotal,
    attributedNet: incomeTotal - expenseTotal,
    feePaymentCount: input.feePayments.length,
    expenseCount: input.expenses.length,
    expenseCategoryRows: buildExpenseCategoryRows(input.expenses),
  };
}

function buildExpenseCategoryRows(
  expenses: SettlementExpenseInput[],
): SettlementExpenseCategoryRow[] {
  return EXPENSE_CATEGORIES.map((category) => {
    const categoryExpenses = expenses.filter(
      (expense) => expense.category === category,
    );

    return {
      category,
      amount: categoryExpenses.reduce(
        (total, expense) => total + expense.amount,
        0,
      ),
      count: categoryExpenses.length,
    };
  }).filter((row) => row.count > 0);
}

export function formatSettlementBalance(value: number) {
  if (value > 0) {
    return `+${formatCurrency(value)}원`;
  }

  if (value < 0) {
    return `-${formatCurrency(Math.abs(value))}원`;
  }

  return "0원";
}

export function formatSeoulProcessedDateTime(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(value instanceof Date ? value : new Date(value))
    .reduce<Record<string, string>>((result, part) => {
      if (part.type !== "literal") result[part.type] = part.value;
      return result;
    }, {});

  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export { formatCurrency, formatExpenseCategory, formatPeriodMonth };
