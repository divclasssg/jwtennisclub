import {
  MEMBER_STATUS_LABELS,
  MEMBER_STATUSES,
  type MemberStatus,
} from "./member-model";

export type MemberListRow = {
  id: string;
  name: string;
  phoneLastFour: string | null;
  status: MemberStatus;
  joinedDate: string;
  withdrawnDate: string | null;
  withdrawalReason: string | null;
};

export type MemberListFilters = {
  query: string;
  status: MemberStatus | "all";
};

export type MemberListSearchParams = {
  q?: string | string[];
  status?: string | string[];
};

type MemberDatabaseRow = {
  id: string;
  name: string;
  phone_last_four: string | null;
  status: MemberStatus;
  joined_date: string;
  withdrawn_date: string | null;
  withdrawal_reason: string | null;
};

export function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeMemberListFilters(
  params: MemberListSearchParams,
): MemberListFilters {
  const query = firstSearchParam(params.q)?.trim() ?? "";
  const status = firstSearchParam(params.status);

  return {
    query,
    status: isMemberStatus(status) ? status : "all",
  };
}

export function isMemberStatus(value: unknown): value is MemberStatus {
  return (
    typeof value === "string" &&
    (MEMBER_STATUSES as readonly string[]).includes(value)
  );
}

export function mapMemberRow(row: MemberDatabaseRow): MemberListRow {
  return {
    id: row.id,
    name: row.name,
    phoneLastFour: row.phone_last_four,
    status: row.status,
    joinedDate: row.joined_date,
    withdrawnDate: row.withdrawn_date,
    withdrawalReason: row.withdrawal_reason,
  };
}

export function formatMemberStatus(status: MemberStatus) {
  return MEMBER_STATUS_LABELS[status];
}

export function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return value.replaceAll("-", ".");
}
