import Link from "next/link";
import { Badge } from "@/components/atoms";
import { getCurrentPeriodMonth } from "@/features/fees/fee-model";
import {
  formatMemberDirectoryKind,
  formatMemberPosition,
  formatMemberStatus,
  formatPauseStartMonth,
  isMemberActivityPending,
  isMemberActivityStartUnconfirmed,
} from "./member-list";
import type { MemberListRow } from "./member-directory";
import styles from "./MemberMobileList.module.scss";

type MemberMobileListProps = {
  canUpdate?: boolean;
  members: MemberListRow[];
};

export function MemberMobileList({
  canUpdate = true,
  members,
}: MemberMobileListProps) {
  const currentPeriodMonth = getCurrentPeriodMonth();

  return (
    <ul aria-label="모바일 회원 목록" className={styles["member-mobile-list"]}>
      {members.map((member) => {
        const activityPending = isMemberActivityPending(
          member,
          currentPeriodMonth,
        );
        const activityStartUnconfirmed =
          isMemberActivityStartUnconfirmed(member);

        return (
          <li className={styles["member-mobile-item"]} key={member.id}>
            <div className={styles["member-mobile-header"]}>
              <div className={styles["member-mobile-title"]}>
                <h3 className={styles["member-mobile-name"]}>{member.name}</h3>
                <div className={styles["member-mobile-meta"]}>
                  <span>{member.memberCode}</span>
                  <span>{formatMemberPosition(member)}</span>
                  <span>{formatMemberDirectoryKind(member)}</span>
                  <span>{formatMemberStatus(member.status)}</span>
                </div>
                {activityPending || activityStartUnconfirmed ? (
                  <div className={styles["member-mobile-badges"]}>
                    {activityPending ? <Badge tone="muted">활동 예정</Badge> : null}
                    {activityStartUnconfirmed ? (
                      <Badge tone="danger">활동 시작월 확인 필요</Badge>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {canUpdate ? (
                <Link
                  aria-label={`${member.name} 수정`}
                  className={styles["member-mobile-edit-link"]}
                  href={`/members/${member.id}/edit`}
                >
                  수정
                </Link>
              ) : null}
            </div>
            <div className={styles["member-mobile-detail-list"]}>
              {member.status === "paused" ? (
                <p className={styles["member-mobile-detail"]}>
                  휴회 시작 {formatPauseStartMonth(member.pauseStartMonth)}
                </p>
              ) : null}
              <p className={styles["member-mobile-detail"]}>
                활동 시작 {formatPauseStartMonth(member.activityStartMonth)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
