export const DEFAULT_MONTHLY_FEE_AMOUNT = 30000;

export type FeePaymentRecord = {
  id: string;
  memberId: string;
  memberName: string;
  memberPhoneLastFour: string | null;
  periodMonth: string;
  amount: number;
  paidDate: string;
  memo: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

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

export function formatPeriodMonth(value: string) {
  return value.slice(0, 7).replace("-", ".");
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function isValidDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export function getCurrentPeriodMonth(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}-01`;
}

export function getPeriodMonthEnd(periodMonth: string) {
  const [year, month] = periodMonth.split("-").map(Number);
  const end = new Date(year, month, 0);
  const endMonth = String(end.getMonth() + 1).padStart(2, "0");
  const endDay = String(end.getDate()).padStart(2, "0");

  return `${end.getFullYear()}-${endMonth}-${endDay}`;
}
