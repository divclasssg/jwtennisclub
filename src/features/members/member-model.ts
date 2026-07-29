export const MEMBER_STATUSES = ["active", "paused", "withdrawn"] as const;

export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const MEMBER_STATUS_LABELS: Readonly<Record<MemberStatus, string>> =
  Object.freeze({
    active: "활동중",
    paused: "휴회",
    withdrawn: "탈퇴",
  });

export type MemberRecord = {
  id: string;
  memberCode: string;
  groupId: string | null;
  groupCode: string | null;
  name: string;
  status: MemberStatus;
  joinedDate: string;
  withdrawnDate: string | null;
  pauseStartMonth: string | null;
  memo: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MemberLifecycleInput = Pick<
  MemberRecord,
  "status" | "joinedDate" | "withdrawnDate" | "pauseStartMonth"
>;

export function isFeeChargeTarget(status: MemberStatus): boolean {
  return status === "active";
}

export function isMemberEligibleForPeriod(
  member: Pick<MemberRecord, "status" | "pauseStartMonth">,
  periodMonth: string,
): boolean {
  if (member.status === "active") return true;
  return (
    member.status === "paused" &&
    member.pauseStartMonth !== null &&
    periodMonth < member.pauseStartMonth
  );
}

export function validateMemberLifecycle(
  member: MemberLifecycleInput,
): string[] {
  const errors: string[] = [];

  if (member.status === "withdrawn" && !member.withdrawnDate) {
    errors.push("탈퇴 회원은 탈퇴일이 필요합니다.");
  }

  if (member.status !== "withdrawn" && member.withdrawnDate) {
    errors.push("활동중 또는 휴회 회원은 탈퇴일을 비워야 합니다.");
  }

  if (member.status === "paused" && !member.pauseStartMonth) {
    errors.push("휴회 회원은 휴회 시작 월이 필요합니다.");
  }

  if (member.status !== "paused" && member.pauseStartMonth) {
    errors.push("활동중 또는 탈퇴 회원은 휴회 시작 월을 비워야 합니다.");
  }

  if (
    member.withdrawnDate &&
    Date.parse(member.withdrawnDate) < Date.parse(member.joinedDate)
  ) {
    errors.push("탈퇴일은 가입일보다 빠를 수 없습니다.");
  }

  return errors;
}
