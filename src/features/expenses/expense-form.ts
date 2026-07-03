import {
  isExpenseCategory,
  isValidDateInput,
  type ExpenseCategory,
} from "./expense-model";

export type ExpenseFormInput = {
  expenseDate: string;
  category: ExpenseCategory | "";
  description: string;
  amount: number;
  hasReceipt: boolean;
  memo: string | null;
};

export type ExpenseDatabaseInput = {
  expense_date: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  has_receipt: boolean;
  memo: string | null;
};

export function parseExpenseFormData(formData: FormData): ExpenseFormInput {
  return normalizeExpenseInput({
    expenseDate: readFormString(formData, "expenseDate"),
    category: readFormString(formData, "category"),
    description: readFormString(formData, "description"),
    amount: readFormString(formData, "amount"),
    hasReceipt: readFormString(formData, "hasReceipt"),
    memo: readFormString(formData, "memo"),
  });
}

export function normalizeExpenseInput(input: {
  expenseDate?: string | null;
  category?: string | null;
  description?: string | null;
  amount?: string | number | null;
  hasReceipt?: string | boolean | null;
  memo?: string | null;
}): ExpenseFormInput {
  const numericAmount =
    typeof input.amount === "number"
      ? input.amount
      : Number.parseInt(input.amount?.trim() ?? "", 10);

  return {
    expenseDate: normalizeRequiredText(input.expenseDate),
    category: isExpenseCategory(input.category) ? input.category : "",
    description: normalizeRequiredText(input.description),
    amount: Number.isFinite(numericAmount) ? numericAmount : 0,
    hasReceipt: input.hasReceipt === true || input.hasReceipt === "on",
    memo: normalizeOptionalText(input.memo),
  };
}

export function validateExpenseForm(input: ExpenseFormInput): string[] {
  const errors: string[] = [];

  if (!isValidDateInput(input.expenseDate)) {
    errors.push("사용일을 YYYY-MM-DD 형식으로 입력하세요.");
  }

  if (!isExpenseCategory(input.category)) {
    errors.push("카테고리를 선택하세요.");
  }

  if (!input.description) {
    errors.push("내용을 입력하세요.");
  }

  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    errors.push("지출 금액은 1원 이상의 정수로 입력하세요.");
  }

  if (input.amount > 999999999) {
    errors.push("지출 금액이 너무 큽니다.");
  }

  return errors;
}

export function toExpenseDatabaseInput(
  input: ExpenseFormInput,
): ExpenseDatabaseInput {
  if (!isExpenseCategory(input.category)) {
    throw new Error("Invalid expense category");
  }

  return {
    expense_date: input.expenseDate,
    category: input.category,
    description: input.description,
    amount: input.amount,
    has_receipt: input.hasReceipt,
    memo: input.memo,
  };
}

function readFormString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}

function normalizeRequiredText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}
