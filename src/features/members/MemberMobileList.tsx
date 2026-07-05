import Link from "next/link";
import { Badge } from "@/components/atoms";
import {
  formatDate,
  formatMemberKind,
  formatMemberStatus,
  type MemberListRow,
} from "./member-list";
import type { MemberStatus } from "./member-model";
import styles from "./MemberMobileList.module.scss";

type MemberMobileListProps = {
  members: MemberListRow[];
};

function getMemberStatusTone(status: MemberStatus) {
  if (status === "active") {
    return "success";
  }

  if (status === "withdrawn") {
    return "danger";
  }

  return "muted";
}

export function MemberMobileList({ members }: MemberMobileListProps) {
  return (
    <ul aria-label="모바일 회원 목록" className={styles["member-mobile-list"]}>
      {members.map((member) => (
        <li className={styles["member-mobile-item"]} key={member.id}>
          <div className={styles["member-mobile-header"]}>
            <div className={styles["member-mobile-title"]}>
              <h3 className={styles["member-mobile-name"]}>{member.name}</h3>
              <div className={styles["member-mobile-badges"]}>
                <Badge tone={member.operatorProfileId ? "info" : "muted"}>
                  {formatMemberKind(member)}
                </Badge>
                <Badge tone={getMemberStatusTone(member.status)}>
                  {formatMemberStatus(member.status)}
                </Badge>
              </div>
            </div>
            <Link
              aria-label={`${member.name} 수정`}
              className={styles["member-mobile-edit-link"]}
              href={`/members/${member.id}/edit`}
            >
              수정
            </Link>
          </div>

          <div className={styles["member-mobile-detail-list"]}>
            <p className={styles["member-mobile-detail"]}>
              연락처 {member.phoneLastFour ?? "-"}
            </p>
            <p className={styles["member-mobile-detail"]}>
              가입일 {formatDate(member.joinedDate)}
            </p>
            <p className={styles["member-mobile-detail"]}>
              탈퇴일 {formatDate(member.withdrawnDate)}
            </p>
            <p className={styles["member-mobile-detail"]}>
              탈퇴 사유 {member.withdrawalReason ?? "-"}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
