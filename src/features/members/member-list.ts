import {
  MEMBER_STATUS_LABELS,
  MEMBER_STATUSES,
  type MemberStatus,
} from "./member-model";

const MEMBER_STATUS_TAB_LABELS: Readonly<Record<MemberStatus, string>> =
  Object.freeze({
    active: "활동",
    paused: "휴회",
    withdrawn: "탈퇴",
  });

export type MemberListRow = {
  id: string;
  name: string;
  phoneLastFour: string | null;
  operatorProfileId: string | null;
  operatorPositionName: string | null;
  operatorPositionSortOrder: number | null;
  status: MemberStatus;
  joinedDate: string;
  withdrawnDate: string | null;
  withdrawalReason: string | null;
  memo: string | null;
};

export type MemberListFilters = {
  query: string;
  status: MemberStatus;
};

export type MemberListSearchParams = {
  q?: string | string[];
  status?: string | string[];
};

export function buildMemberSearchFilter(query: string) {
  const escapedQuery = query
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
  const pattern = `"%${escapedQuery}%"`;

  return `name.ilike.${pattern},member_code.ilike.${pattern}`;
}

type MemberDatabaseRow = {
  id: string;
  name: string;
  phone_last_four: string | null;
  operator_profile_id?: string | null;
  status: MemberStatus;
  joined_date: string;
  withdrawn_date: string | null;
  withdrawal_reason: string | null;
  memo?: string | null;
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
    status: isMemberStatus(status) ? status : "active",
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
    operatorProfileId: row.operator_profile_id ?? null,
    operatorPositionName: null,
    operatorPositionSortOrder: null,
    status: row.status,
    joinedDate: row.joined_date,
    withdrawnDate: row.withdrawn_date,
    withdrawalReason: row.withdrawal_reason,
    memo: row.memo ?? null,
  };
}

export function applyOperatorPositionInfo(
  member: MemberListRow,
  positionInfo: {
    name: string | null;
    sortOrder: number | null;
  } | null,
): MemberListRow {
  return {
    ...member,
    operatorPositionName: positionInfo?.name ?? null,
    operatorPositionSortOrder: positionInfo?.sortOrder ?? null,
  };
}

export function sortMemberListRows(rows: MemberListRow[]): MemberListRow[] {
  return [...rows].sort((left, right) => {
    const leftGroup = left.operatorProfileId ? 0 : 1;
    const rightGroup = right.operatorProfileId ? 0 : 1;

    if (leftGroup !== rightGroup) {
      return leftGroup - rightGroup;
    }

    const leftPositionOrder = left.operatorPositionSortOrder ?? 999;
    const rightPositionOrder = right.operatorPositionSortOrder ?? 999;

    if (leftPositionOrder !== rightPositionOrder) {
      return leftPositionOrder - rightPositionOrder;
    }

    return left.name.localeCompare(right.name, "ko-KR");
  });
}

export function formatMemberKind(member: Pick<MemberListRow, "operatorProfileId">) {
  return member.operatorProfileId ? "운영진" : "일반회원";
}

export function formatMemberStatus(status: MemberStatus) {
  return MEMBER_STATUS_LABELS[status];
}

export function formatMemberStatusTab(status: MemberStatus) {
  return MEMBER_STATUS_TAB_LABELS[status];
}

export function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return value.replaceAll("-", ".");
}
