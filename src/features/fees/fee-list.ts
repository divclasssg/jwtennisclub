import {
  DEFAULT_MONTHLY_FEE_AMOUNT,
  formatCurrency,
  formatPeriodMonth,
  getCurrentPeriodMonth,
  normalizePeriodMonth,
  type FeePaymentRecord,
} from "./fee-model";
import {
  firstSearchParam,
  sortMemberListRows,
  type MemberListRow,
} from "@/features/members/member-list";

export type FeeListSearchParams = {
  month?: string | string[];
  q?: string | string[];
  status?: string | string[];
};

export type FeeListFilters = {
  periodMonth: string;
  query: string;
  status: FeePaymentStatusFilter;
};

export const FEE_PAYMENT_STATUS_FILTERS = ["all", "unpaid", "paid"] as const;

export type FeePaymentStatusFilter = (typeof FEE_PAYMENT_STATUS_FILTERS)[number];

type FeePaymentDatabaseRow = {
  id: string;
  member_id: string;
  period_month: string;
  amount: number;
  paid_date: string;
  memo: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  members:
    | {
        name: string;
        phone_last_four: string | null;
      }
    | {
        name: string;
        phone_last_four: string | null;
      }[]
    | null;
};

export type FeeListSummary = {
  expectedCount: number;
  paidCount: number;
  unpaidCount: number;
  paidTotal: number;
  expectedTotal: number;
};

export type FeeBoardMemberRow = {
  memberId: string;
  memberName: string;
  memberPhoneLastFour: string | null;
  operatorProfileId: string | null;
  payment: FeePaymentRecord | null;
};

export function normalizeFeeListFilters(
  params: FeeListSearchParams,
  fallbackMonth = getCurrentPeriodMonth(),
): FeeListFilters {
  const periodMonth =
    normalizePeriodMonth(firstSearchParam(params.month)) || fallbackMonth;
  const status = firstSearchParam(params.status);

  return {
    periodMonth,
    query: firstSearchParam(params.q)?.trim() ?? "",
    status: isFeePaymentStatusFilter(status) ? status : "all",
  };
}

export function isFeePaymentStatusFilter(
  value: unknown,
): value is FeePaymentStatusFilter {
  return (
    typeof value === "string" &&
    (FEE_PAYMENT_STATUS_FILTERS as readonly string[]).includes(value)
  );
}

export function mapFeePaymentRow(
  row: FeePaymentDatabaseRow,
): FeePaymentRecord {
  const member = Array.isArray(row.members) ? row.members[0] : row.members;

  return {
    id: row.id,
    memberId: row.member_id,
    memberName: member?.name ?? "알 수 없는 회원",
    memberPhoneLastFour: member?.phone_last_four ?? null,
    periodMonth: row.period_month,
    amount: row.amount,
    paidDate: row.paid_date,
    memo: row.memo,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function buildFeeListSummary(input: {
  expectedCount: number;
  payments: Pick<FeePaymentRecord, "amount">[];
  monthlyFeeAmount?: number;
}): FeeListSummary {
  const paidTotal = input.payments.reduce(
    (total, payment) => total + payment.amount,
    0,
  );
  const paidCount = input.payments.length;
  const expectedCount = input.expectedCount;

  return {
    expectedCount,
    paidCount,
    unpaidCount: Math.max(expectedCount - paidCount, 0),
    paidTotal,
    expectedTotal: expectedCount * (input.monthlyFeeAmount ?? DEFAULT_MONTHLY_FEE_AMOUNT),
  };
}

export function buildFeeBoardRows(input: {
  members: {
    id: string;
    name: string;
    phoneLastFour: string | null;
  }[] | MemberListRow[];
  payments: FeePaymentRecord[];
  query?: string;
  status?: FeePaymentStatusFilter;
}): FeeBoardMemberRow[] {
  const paymentsByMemberId = new Map(
    input.payments.map((payment) => [payment.memberId, payment]),
  );
  const query = input.query?.toLowerCase() ?? "";
  const status = input.status ?? "all";

  return sortMemberListRows(input.members as MemberListRow[])
    .map((member) => ({
      memberId: member.id,
      memberName: member.name,
      memberPhoneLastFour: member.phoneLastFour,
      operatorProfileId: member.operatorProfileId,
      payment: paymentsByMemberId.get(member.id) ?? null,
    }))
    .filter((row) => {
      if (!query) {
        return true;
      }

      return (
        row.memberName.toLowerCase().includes(query) ||
        (row.memberPhoneLastFour?.includes(query) ?? false)
      );
    })
    .filter((row) => {
      if (status === "paid") {
        return Boolean(row.payment);
      }

      if (status === "unpaid") {
        return !row.payment;
      }

      return true;
    });
}

export { formatCurrency, formatPeriodMonth };
