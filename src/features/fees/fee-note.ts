import { normalizePeriodMonth } from "./fee-model";

export const FEE_SORT_KEYS = [
  "memberCode",
  "name",
  "kind",
  "status",
  "amount",
  "paidDate",
  "memo",
] as const;

export type FeeSortKey = (typeof FEE_SORT_KEYS)[number];

export type FeeMonthlyNoteRecord = {
  id: string;
  memberId: string;
  periodMonth: string;
  memo: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FeeMonthlyNoteDatabaseRow = {
  id: string;
  member_id: string;
  period_month: string;
  memo: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type FeeListState = {
  month?: string;
  q?: string;
  sort?: string;
  direction?: string;
};

type FeeListOverrides = {
  note?: string;
  noteError?: string;
  status?: string;
};

export function mapFeeMonthlyNoteRow(
  row: FeeMonthlyNoteDatabaseRow,
): FeeMonthlyNoteRecord {
  return {
    id: row.id,
    memberId: row.member_id,
    periodMonth: row.period_month,
    memo: row.memo,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeFeeNoteInput(
  value: FormDataEntryValue | string | null,
) {
  const memo = typeof value === "string" ? value.trim() : "";

  if (memo.length > 500) {
    return { ok: false as const, error: "too-long" as const };
  }

  return { ok: true as const, memo: memo || null };
}

export function buildFeesHref(
  state: FeeListState,
  overrides: FeeListOverrides = {},
) {
  const searchParams = new URLSearchParams();
  const periodMonth = normalizePeriodMonth(state.month);
  const query = state.q?.trim();
  const sort = FEE_SORT_KEYS.find((key) => key === state.sort);

  if (periodMonth) {
    searchParams.set("month", periodMonth.slice(0, 7));
  }

  if (query) {
    searchParams.set("q", query);
  }

  if (sort) {
    searchParams.set("sort", sort);
    searchParams.set("direction", state.direction === "desc" ? "desc" : "asc");
  }

  if (overrides.note) {
    searchParams.set("note", overrides.note);
  }

  if (overrides.noteError) {
    searchParams.set("noteError", overrides.noteError);
  }

  if (overrides.status) {
    searchParams.set("status", overrides.status);
  }

  const queryString = searchParams.toString();

  return queryString ? `/fees?${queryString}` : "/fees";
}
