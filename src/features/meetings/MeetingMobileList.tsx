import Link from "next/link";
import type { ReactNode } from "react";
import type { MeetingDirectoryRow } from "./meeting-model";
import {
  formatMeetingTime,
  getMeetingCardNumberLabel,
  getMeetingKindPresentation,
  getMeetingStatusPresentation,
} from "./meeting-presentation";
import styles from "./MeetingMobileList.module.scss";

type MeetingMobileListProps = {
  meetings: MeetingDirectoryRow[];
  renderActions?: (meeting: MeetingDirectoryRow) => ReactNode;
};

function MeetingCounts({ meeting }: { meeting: MeetingDirectoryRow }) {
  const { counts } = meeting;

  if (!counts) {
    return (
      <p className={styles["meeting-mobile-preparing"]}>
        전월 마지막 7일에 명단이 준비됩니다.
      </p>
    );
  }

  return (
    <div
      aria-label={`${meeting.title} 명단 요약`}
      className={styles["meeting-mobile-count-list"]}
      role="group"
    >
      <p className={styles["meeting-mobile-count"]}>대상 {counts.total}명</p>
      <p className={styles["meeting-mobile-count"]}>
        사전 참석 {counts.rsvpAttending}명 · 늦참 {counts.rsvpLate}명 · 불참{" "}
        {counts.rsvpDeclined}명 · 미응답 {counts.rsvpUnanswered}명
      </p>
      <p className={styles["meeting-mobile-count"]}>
        출석 {counts.attendancePresent}명 · 지각 {counts.attendanceLate}명 · 결석{" "}
        {counts.attendanceAbsent}명 · 미확인 {counts.attendanceUnchecked}명
      </p>
    </div>
  );
}

export function MeetingMobileList({ meetings, renderActions }: MeetingMobileListProps) {
  return (
    <ul aria-label="모바일 정모 목록" className={styles["meeting-mobile-list"]}>
      {meetings.map((meeting) => {
        const actions = renderActions?.(meeting);
        const kind = getMeetingKindPresentation(meeting.meetingKind);
        const status = getMeetingStatusPresentation(meeting.status);

        return (
          <li className={styles["meeting-mobile-item"]} key={meeting.id}>
            <div className={styles["meeting-mobile-header"]}>
              <div className={styles["meeting-mobile-title"]}>
                <h3 className={styles["meeting-mobile-name"]}>{meeting.title}</h3>
                <div className={styles["meeting-mobile-meta"]}>
                  <span className={styles["meeting-mobile-number"]}>
                    {getMeetingCardNumberLabel(meeting)}
                  </span>
                  <span
                    className={styles["meeting-mobile-presentation"]}
                    data-tone={kind.tone}
                  >
                    {kind.label}
                  </span>
                  <span
                    className={styles["meeting-mobile-presentation"]}
                    data-tone={status.tone}
                  >
                    {status.label}
                  </span>
                  {meeting.meetingKind === "lightning" ? (
                    <span className={styles["meeting-mobile-linkage"]}>
                      정기 정모 연결됨
                    </span>
                  ) : null}
                </div>
              </div>
              {meeting.counts ? (
                <Link
                  aria-label={`${meeting.title} 명단 보기`}
                  className={styles["meeting-mobile-roster-link"]}
                  href={`/meetings?month=${meeting.periodMonth.slice(0, 7)}&meeting=${meeting.id}`}
                >
                  명단
                </Link>
              ) : (
                <span className={styles["meeting-mobile-roster-disabled"]}>
                  명단 준비 전
                </span>
              )}
            </div>

            <div className={styles["meeting-mobile-detail-list"]}>
              <p className={styles["meeting-mobile-detail"]}>
                날짜 {meeting.meetingDate}
              </p>
              <p className={styles["meeting-mobile-detail"]}>
                시간 {formatMeetingTime(meeting.startTime)}–{formatMeetingTime(meeting.endTime)}
              </p>
              <p className={styles["meeting-mobile-detail"]}>
                장소 {meeting.location ?? "미정"}
              </p>
            </div>

            <MeetingCounts meeting={meeting} />
            {actions ? (
              <div className={styles["meeting-mobile-actions"]}>{actions}</div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
