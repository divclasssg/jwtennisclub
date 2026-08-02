import {
  DEFAULT_MONTHLY_FEE_AMOUNT,
  FEE_EXEMPT_MEMBER_CODE,
  formatCurrency,
  formatPeriodMonth,
  getCurrentPeriodMonth,
  normalizePeriodMonth,
  type FeePaymentRecord,
} from "./fee-model";
import { firstSearchParam } from "@/features/members/member-list";
import type { FeeMonthlyNoteRecord } from "./fee-note";

export type FeeListSearchParams = {
  month?: string | string[];
  q?: string | string[];
  sort?: string | string[];
  direction?: string | string[];
  note?: string | string[];
  noteError?: string | string[];
  status?: string | string[];
};

export type FeeListFilters = {
  periodMonth: string;
  query: string;
};

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
  note: FeeMonthlyNoteRecord | null;
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
  return {
    periodMonth,
    query: firstSearchParam(params.q)?.trim() ?? "",
  };
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
  const monthlyFeeAmount =
    input.monthlyFeeAmount ?? DEFAULT_MONTHLY_FEE_AMOUNT;
  const paidCount = input.payments.filter(
    (payment) => payment.amount >= monthlyFeeAmount,
  ).length;
  const expectedCount = input.expectedCount;

  return {
    expectedCount,
    paidCount,
    unpaidCount: Math.max(expectedCount - paidCount, 0),
    paidTotal,
    expectedTotal: expectedCount * monthlyFeeAmount,
  };
}

export function getFeePaymentStatus(
  payment: Pick<FeePaymentRecord, "amount"> | null | undefined,
  monthlyFeeAmount = DEFAULT_MONTHLY_FEE_AMOUNT,
) {
  if (!payment || payment.amount <= 0) {
    return {
      label: "미납" as const,
      remainingAmount: monthlyFeeAmount,
    };
  }

  if (payment.amount < monthlyFeeAmount) {
    return {
      label: "부분납부" as const,
      remainingAmount: monthlyFeeAmount - payment.amount,
    };
  }

  return {
    label: "납부완료" as const,
    remainingAmount: 0,
  };
}

export function buildFeeBoardRows(input: {
  members: FeeBoardSourceMember[];
  payments: FeePaymentRecord[];
  notes?: FeeMonthlyNoteRecord[];
  query?: string;
}): FeeBoardMemberRow[] {
  const paymentsByMemberId = new Map(
    input.payments.map((payment) => [payment.memberId, payment]),
  );
  const query = input.query?.toLowerCase() ?? "";
  const notesByMemberId = new Map(
    (input.notes ?? []).map((note) => [note.memberId, note]),
  );

  return input.members
    .filter((member) => member.memberCode !== FEE_EXEMPT_MEMBER_CODE)
    .sort((left, right) =>
      left.memberCode.localeCompare(right.memberCode, "ko-KR", { numeric: true }),
    )
    .map((member) => ({
      memberId: member.id,
      memberName: member.name,
      memberCode: member.memberCode,
      operatorProfileId: member.operatorProfileId,
      payment: paymentsByMemberId.get(member.id) ?? null,
      note: notesByMemberId.get(member.id) ?? null,
    }))
    .filter((row) => {
      if (!query) {
        return true;
      }

      return (
        row.memberName.toLowerCase().includes(query) ||
        row.memberCode.toLowerCase().includes(query)
      );
    });
}

export { formatCurrency, formatPeriodMonth };
