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
        member_code: string;
      }
    | {
        name: string;
        member_code: string;
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
  memberCode: string;
  operatorProfileId: string | null;
  payment: FeePaymentRecord | null;
};

type FeeBoardSourceMember = {
  id: string;
  memberCode: string;
  name: string;
  operatorProfileId: string | null;
  operatorPositionName: string | null;
  operatorPositionSortOrder: number | null;
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
    memberCode: member?.member_code ?? "",
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
  members: FeeBoardSourceMember[];
  payments: FeePaymentRecord[];
  query?: string;
  status?: FeePaymentStatusFilter;
}): FeeBoardMemberRow[] {
  const paymentsByMemberId = new Map(
    input.payments.map((payment) => [payment.memberId, payment]),
  );
  const query = input.query?.toLowerCase() ?? "";
  const status = input.status ?? "all";

  return sortMemberListRows(input.members)
    .map((member) => ({
      memberId: member.id,
      memberName: member.name,
      memberCode: member.memberCode,
      operatorProfileId: member.operatorProfileId,
      payment: paymentsByMemberId.get(member.id) ?? null,
    }))
    .filter((row) => {
      if (!query) {
        return true;
      }

      return (
        row.memberName.toLowerCase().includes(query) ||
        row.memberCode.toLowerCase().includes(query)
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
