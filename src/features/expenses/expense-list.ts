import {
  EXPENSE_CATEGORIES,
  formatCurrency,
  formatExpenseCategory,
  formatPeriodMonth,
  getCurrentPeriodMonth,
  getNextPeriodMonth,
  isExpenseCategory,
  normalizePeriodMonth,
  type ExpenseCategory,
  type ExpenseRecord,
} from "./expense-model";
import { firstSearchParam } from "@/features/members/member-list";

export type ExpenseListSearchParams = {
  month?: string | string[];
  category?: string | string[];
  sort?: string | string[];
  direction?: string | string[];
};

export type ExpenseListFilters = {
  periodMonth: string;
  category: ExpenseCategory | "all";
};

type ExpenseDatabaseRow = {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  has_receipt: boolean;
  receipt_content_type: string | null;
  receipt_file_key: string | null;
  receipt_file_name: string | null;
  receipt_file_size: number | null;
  memo: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeExpenseListFilters(
  params: ExpenseListSearchParams,
  fallbackMonth = getCurrentPeriodMonth(),
): ExpenseListFilters {
  const category = firstSearchParam(params.category);

  return {
    periodMonth:
      normalizePeriodMonth(firstSearchParam(params.month)) || fallbackMonth,
    category: isExpenseCategory(category) ? category : "all",
  };
}

export function mapExpenseRow(row: ExpenseDatabaseRow): ExpenseRecord {
  return {
    id: row.id,
    expenseDate: row.expense_date,
    category: isExpenseCategory(row.category) ? row.category : "other",
    description: row.description,
    amount: row.amount,
    hasReceipt: row.has_receipt,
    receiptContentType: row.receipt_content_type,
    receiptFileKey: row.receipt_file_key,
    receiptFileName: row.receipt_file_name,
    receiptFileSize: row.receipt_file_size,
    memo: row.memo,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function buildExpenseListSummary(
  expenses: Pick<ExpenseRecord, "amount">[],
) {
  return {
    count: expenses.length,
    totalAmount: expenses.reduce((total, expense) => total + expense.amount, 0),
  };
}

export {
  EXPENSE_CATEGORIES,
  formatCurrency,
  formatExpenseCategory,
  formatPeriodMonth,
  getNextPeriodMonth,
};
