import Link from "next/link";
import { Badge } from "@/components/atoms";
import {
  formatDate,
  formatMemberDirectoryKind,
  formatMemberPosition,
  formatMemberStatus,
  formatPauseStartMonth,
} from "./member-list";
import type { MemberListRow } from "./member-directory";
import type { MemberStatus } from "./member-model";
import styles from "./MemberMobileList.module.scss";

type MemberMobileListProps = {
  canUpdate?: boolean;
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

export function MemberMobileList({ canUpdate = true, members }: MemberMobileListProps) {
  return (
    <ul aria-label="모바일 회원 목록" className={styles["member-mobile-list"]}>
      {members.map((member) => (
        <li className={styles["member-mobile-item"]} key={member.id}>
          <div className={styles["member-mobile-header"]}>
            <div className={styles["member-mobile-title"]}>
              <h3 className={styles["member-mobile-name"]}>{member.name}</h3>
              <div className={styles["member-mobile-badges"]}>
                <Badge tone={getMemberStatusTone(member.status)}>
                  {formatMemberStatus(member.status)}
                </Badge>
              </div>
            </div>
            {canUpdate ? <Link
              aria-label={`${member.name} 수정`}
              className={styles["member-mobile-edit-link"]}
              href={`/members/${member.id}/edit`}
            >
              수정
            </Link> : null}
          </div>

          <div className={styles["member-mobile-detail-list"]}>
            <p className={styles["member-mobile-detail"]}>회원번호 {member.memberCode}</p>
            <p className={styles["member-mobile-detail"]}>
              연락처 {member.phoneDisplay}
            </p>
            <p className={styles["member-mobile-detail"]}>그룹 {member.groupCode ?? "없음"}</p>
            <p className={styles["member-mobile-detail"]}>구분 {formatMemberDirectoryKind(member)}</p>
            <p className={styles["member-mobile-detail"]}>직책 {formatMemberPosition(member)}</p>
            <p className={styles["member-mobile-detail"]}>
              휴회 시작 {formatPauseStartMonth(member.status === "paused" ? member.pauseStartMonth : null)}
            </p>
            <p className={styles["member-mobile-detail"]}>
              가입일 {formatDate(member.joinedDate)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
