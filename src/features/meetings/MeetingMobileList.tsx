import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/atoms";
import type { MeetingDirectoryRow } from "./meeting-model";
import styles from "./MeetingMobileList.module.scss";

type MeetingMobileListProps = {
  meetings: MeetingDirectoryRow[];
  renderActions?: (meeting: MeetingDirectoryRow) => ReactNode;
};

function formatMeetingKind(meeting: MeetingDirectoryRow) {
  return meeting.meetingKind === "regular" ? "정기" : "번개";
}

function getMeetingKindTone(meeting: MeetingDirectoryRow) {
  return meeting.meetingKind === "regular" ? "info" : "muted";
}

function formatMeetingStatus(meeting: MeetingDirectoryRow) {
  if (meeting.status === "completed") {
    return "완료";
  }

  if (meeting.status === "cancelled") {
    return "취소";
  }

  return "예정";
}

function getMeetingStatusTone(meeting: MeetingDirectoryRow) {
  if (meeting.status === "completed") {
    return "success";
  }

  if (meeting.status === "cancelled") {
    return "danger";
  }

  return "info";
}

function formatMeetingTime(time: string) {
  return time.slice(0, 5);
}

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
        return (
          <li className={styles["meeting-mobile-item"]} key={meeting.id}>
            <div className={styles["meeting-mobile-header"]}>
              <div className={styles["meeting-mobile-title"]}>
                <h3 className={styles["meeting-mobile-name"]}>{meeting.title}</h3>
                <div className={styles["meeting-mobile-badges"]}>
                  <Badge tone={getMeetingKindTone(meeting)}>
                    {formatMeetingKind(meeting)}
                  </Badge>
                  <Badge tone={getMeetingStatusTone(meeting)}>
                    {formatMeetingStatus(meeting)}
                  </Badge>
                  {meeting.meetingKind === "lightning" ? (
                    <Badge tone={meeting.linkedRegularMeetingId ? "info" : "muted"}>
                      {meeting.linkedRegularMeetingId ? "정기 정모 연결됨" : "독립 번개"}
                    </Badge>
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
