export const EXPENSE_CATEGORIES = [
  "court",
  "balls",
  "meal",
  "event",
  "maintenance",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Readonly<Record<ExpenseCategory, string>> =
  Object.freeze({
    court: "코트",
    balls: "공",
    meal: "식사",
    event: "행사",
    maintenance: "정비",
    other: "기타",
  });

export type ExpenseRecord = {
  id: string;
  expenseDate: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  hasReceipt: boolean;
  receiptContentType: string | null;
  receiptFileKey: string | null;
  receiptFileName: string | null;
  receiptFileSize: number | null;
  memo: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return (
    typeof value === "string" &&
    (EXPENSE_CATEGORIES as readonly string[]).includes(value)
  );
}

export function formatExpenseCategory(category: ExpenseCategory) {
  return EXPENSE_CATEGORY_LABELS[category];
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function formatPeriodMonth(value: string) {
  return value.slice(0, 7).replace("-", ".");
}

export function normalizePeriodMonth(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";

  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return `${trimmed}-01`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed.slice(0, 7)}-01`;
  }

  return "";
}

export function getCurrentPeriodMonth(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}-01`;
}

export function getNextPeriodMonth(periodMonth: string) {
  const [year, month] = periodMonth.split("-").map(Number);
  const next = new Date(year, month, 1);
  const nextMonth = String(next.getMonth() + 1).padStart(2, "0");

  return `${next.getFullYear()}-${nextMonth}-01`;
}

export function isValidDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}
