import {
  DEFAULT_MONTHLY_FEE_AMOUNT,
  isValidDateInput,
  normalizePeriodMonth,
} from "./fee-model";

export type FeePaymentFormInput = {
  memberId: string;
  periodMonth: string;
  amount: number;
  paidDate: string;
  memo: string | null;
};

export type FeePaymentDatabaseInput = {
  member_id: string;
  period_month: string;
  amount: number;
  paid_date: string;
  memo: string | null;
};

export function parseFeePaymentFormData(
  formData: FormData,
): FeePaymentFormInput {
  return normalizeFeePaymentInput({
    memberId: readFormString(formData, "memberId"),
    periodMonth: readFormString(formData, "periodMonth"),
    amount: readFormString(formData, "amount"),
    paidDate: readFormString(formData, "paidDate"),
    memo: readFormString(formData, "memo"),
  });
}

export function normalizeFeePaymentInput(input: {
  memberId?: string | null;
  periodMonth?: string | null;
  amount?: string | number | null;
  paidDate?: string | null;
  memo?: string | null;
}): FeePaymentFormInput {
  const numericAmount =
    typeof input.amount === "number"
      ? input.amount
      : Number.parseInt(input.amount?.trim() ?? "", 10);

  return {
    memberId: normalizeRequiredText(input.memberId),
    periodMonth: normalizePeriodMonth(input.periodMonth),
    amount: Number.isFinite(numericAmount)
      ? numericAmount
      : DEFAULT_MONTHLY_FEE_AMOUNT,
    paidDate: normalizeRequiredText(input.paidDate),
    memo: normalizeOptionalText(input.memo),
  };
}

export function validateFeePaymentForm(input: FeePaymentFormInput): string[] {
  const errors: string[] = [];

  if (!input.memberId) {
    errors.push("회원을 선택하세요.");
  }

  if (!isValidDateInput(input.periodMonth)) {
    errors.push("납부 월을 YYYY-MM 형식으로 입력하세요.");
  }

  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    errors.push("납부 금액은 1원 이상의 정수로 입력하세요.");
  }

  if (input.amount > 999999999) {
    errors.push("납부 금액이 너무 큽니다.");
  }

  if (!isValidDateInput(input.paidDate)) {
    errors.push("납부일을 YYYY-MM-DD 형식으로 입력하세요.");
  }

  return errors;
}

export function toFeePaymentDatabaseInput(
  input: FeePaymentFormInput,
): FeePaymentDatabaseInput {
  return {
    member_id: input.memberId,
    period_month: input.periodMonth,
    amount: input.amount,
    paid_date: input.paidDate,
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
