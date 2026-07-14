import { notFound } from "next/navigation";
import { ActionLink, Button, TextInput } from "@/components/atoms";
import {
  EmptyState,
  FilterBar,
  FormField,
  SummaryCard,
  SummaryGrid,
} from "@/components/molecules";
import { DataPanel, DataTable } from "@/components/organisms";
import { ManagementPageTemplate } from "@/components/templates";
import { currentOperatorHasPermission } from "@/features/auth/operator-context";
import {
  loadMeetingDirectoryPage,
  type MeetingDirectoryPage,
  type MeetingMonthRosterSummary,
} from "@/features/meetings/meeting-directory";
import { MeetingMobileList } from "@/features/meetings/MeetingMobileList";
import type { MeetingDirectoryRow } from "@/features/meetings/meeting-model";
import { MeetingRosterModal } from "@/features/meetings/MeetingRosterModal";
import {
  addMeetingAdHocMember,
  removeMeetingAdHocMember,
} from "./actions";
import { MeetingLifecycleControls } from "./MeetingLifecycleControls";
import styles from "./page.module.scss";

type MeetingSearchParams = {
  meeting?: string | string[];
  month?: string | string[];
  returnTo?: string | string[];
};

type MeetingsPageProps = {
  searchParams: Promise<MeetingSearchParams>;
};

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RETURN_TO_MAX_LENGTH = 2048;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getKstDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function getCurrentKstMonth() {
  const parts = getKstDateParts(new Date());
  return `${parts.year}-${parts.month}`;
}

function normalizeMonth(value: string | undefined) {
  return value && MONTH_PATTERN.test(value) ? value : getCurrentKstMonth();
}

function isDateKey(value: string | null) {
  if (!value || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

export function canonicalizeScheduleReturnTo(value: string | undefined) {
  if (
    !value ||
    value.length > RETURN_TO_MAX_LENGTH ||
    /[\u0000-\u001f\u007f\\#]/.test(value) ||
    /%(?:2f|5c)/i.test(value) ||
    !value.startsWith("/schedule") ||
    value.startsWith("//")
  ) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value, "https://local.invalid");
  } catch {
    return null;
  }

  if (
    parsed.origin !== "https://local.invalid" ||
    parsed.pathname !== "/schedule" ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    return null;
  }

  const canonical = new URLSearchParams();
  const view = parsed.searchParams.get("view");
  const month = parsed.searchParams.get("month");
  const date = parsed.searchParams.get("date");
  const selectedDate = parsed.searchParams.get("selectedDate");

  if (view === "month" || view === "week") canonical.set("view", view);
  if (month && MONTH_PATTERN.test(month)) canonical.set("month", month);
  if (isDateKey(date)) canonical.set("date", date!);
  if (isDateKey(selectedDate)) canonical.set("selectedDate", selectedDate!);

  const query = canonical.toString();
  return query ? `/schedule?${query}` : "/schedule";
}

function formatPeriodMonth(periodMonth: string) {
  const [year, month] = periodMonth.split("-");
  return `${year}년 ${Number(month)}월`;
}

function formatMeetingKind(meeting: MeetingDirectoryRow) {
  return meeting.meetingKind === "regular" ? "정기" : "번개";
}

function formatMeetingStatus(meeting: MeetingDirectoryRow) {
  if (meeting.status === "completed") return "완료";
  if (meeting.status === "cancelled") return "취소";
  return "예정";
}

function formatTime(value: string) {
  return value.slice(0, 5);
}

function formatRsvpCounts(meeting: MeetingDirectoryRow) {
  if (!meeting.counts) return "명단 준비 전";
  return `참석 ${meeting.counts.rsvpAttending} · 늦참 ${meeting.counts.rsvpLate} · 불참 ${meeting.counts.rsvpDeclined} · 미응답 ${meeting.counts.rsvpUnanswered}`;
}

function formatAttendanceCounts(meeting: MeetingDirectoryRow) {
  if (!meeting.counts) return "명단 준비 전";
  return `출석 ${meeting.counts.attendancePresent} · 지각 ${meeting.counts.attendanceLate} · 결석 ${meeting.counts.attendanceAbsent} · 미확인 ${meeting.counts.attendanceUnchecked}`;
}

function formatRosterStatus(roster: MeetingMonthRosterSummary | null) {
  if (!roster) return "명단 준비 전";
  if (roster.status === "preparing") return "다음 달 명단 준비 중";
  if (roster.rosterOrigin === "bootstrap") return "최초 배포 월 · 통계 제외";
  return roster.statisticsEligible
    ? "월 명단 확정 · 통계 포함"
    : "월 명단 확정 · 통계 제외";
}

function meetingTimestamp(meeting: MeetingDirectoryRow, boundary: "start" | "end") {
  const time = boundary === "start" ? meeting.startTime : meeting.endTime;
  return Date.parse(`${meeting.meetingDate}T${time.slice(0, 8)}+09:00`);
}

function isMeetingStarted(meeting: MeetingDirectoryRow, now: number) {
  return now >= meetingTimestamp(meeting, "start");
}

function isMeetingEnded(meeting: MeetingDirectoryRow, now: number) {
  return now >= meetingTimestamp(meeting, "end");
}

function getMeetingLink(meeting: MeetingDirectoryRow) {
  return `/meetings?month=${meeting.periodMonth.slice(0, 7)}&meeting=${meeting.id}`;
}

function getLifecycleControlProps(
  directory: MeetingDirectoryPage,
  meeting: MeetingDirectoryRow,
  now: number,
) {
  const linkedMeetings = directory.meetings.filter(
    (candidate) => candidate.linkedRegularMeetingId === meeting.id,
  );
  return {
    attendanceEnded: isMeetingEnded(meeting, now),
    canManageAttendance: directory.canManageAttendance,
    canManageMeeting: directory.canManageMeeting,
    hasActiveLightning: linkedMeetings.some(
      (linked) => linked.status !== "cancelled",
    ),
    hasLightningHistory: linkedMeetings.length > 0,
  };
}

function MeetingDirectoryTable({
  directory,
  now,
}: {
  directory: MeetingDirectoryPage;
  now: number;
}) {
  return (
    <DataTable>
      <thead>
        <tr>
          <th scope="col">날짜</th>
          <th scope="col">종류</th>
          <th scope="col">회차</th>
          <th scope="col">시간</th>
          <th scope="col">장소</th>
          <th scope="col">상태</th>
          <th scope="col">사전 참석</th>
          <th scope="col">출석</th>
          <th scope="col">관리</th>
        </tr>
      </thead>
      <tbody>
        {directory.meetings.map((meeting) => (
          <tr key={meeting.id}>
            <td>{meeting.meetingDate}</td>
            <td>{formatMeetingKind(meeting)}</td>
            <th scope="row">{meeting.title}</th>
            <td>{formatTime(meeting.startTime)}–{formatTime(meeting.endTime)}</td>
            <td>{meeting.location ?? "미정"}</td>
            <td>{formatMeetingStatus(meeting)}</td>
            <td>{formatRsvpCounts(meeting)}</td>
            <td>{formatAttendanceCounts(meeting)}</td>
            <td>
              <div className={styles["meeting-row-actions"]}>
                <ActionLink
                  aria-label={`${meeting.title} 명단 보기`}
                  href={getMeetingLink(meeting)}
                  size="compact"
                  variant="secondary"
                >
                  명단
                </ActionLink>
                <MeetingLifecycleControls
                  {...getLifecycleControlProps(directory, meeting, now)}
                  meeting={meeting}
                />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

export default async function MeetingsPage({ searchParams }: MeetingsPageProps) {
  if (!await currentOperatorHasPermission("meetings.view")) notFound();

  const params = await searchParams;
  const month = normalizeMonth(firstSearchParam(params.month));
  const requestedMeeting = firstSearchParam(params.meeting)?.trim();
  const meetingId = requestedMeeting && UUID_PATTERN.test(requestedMeeting)
    ? requestedMeeting
    : null;
  const directory = await loadMeetingDirectoryPage({ month, meetingId });
  const invalidMeeting = Boolean(requestedMeeting && !meetingId);
  const modalError = invalidMeeting
    ? "선택한 정모를 열 수 없습니다."
    : directory.modalError;
  const fallbackCloseHref = `/meetings?month=${directory.periodMonth.slice(0, 7)}`;
  const closeHref = canonicalizeScheduleReturnTo(
    firstSearchParam(params.returnTo),
  ) ?? fallbackCloseHref;
  const now = new Date().getTime();
  const selection = directory.selectedMeeting;

  return (
    <>
      <ManagementPageTemplate
        filters={
          <FilterBar aria-label="정모 월 필터" layout="single-control">
            <FormField label="조회 월" labelVisible>
              <TextInput
                defaultValue={directory.periodMonth.slice(0, 7)}
                name="month"
                shape="pill"
                type="month"
              />
            </FormField>
            <Button type="submit">조회</Button>
          </FilterBar>
        }
        kicker="월별 정모 현황"
        list={
          <>
            {modalError ? (
              <p className={styles["meeting-page-error"]} role="alert">
                {modalError}
              </p>
            ) : null}
            <DataPanel
              aria-label="월별 정모 목록"
              empty={
                <EmptyState
                  description="조회 월을 조정해서 정모 회차를 확인하세요."
                  title="등록된 정모가 없습니다"
                />
              }
              headerSide={
                <span className={styles["meeting-roster-status"]}>
                  {formatRosterStatus(directory.roster)}
                </span>
              }
              headerTitle={`${formatPeriodMonth(directory.periodMonth)} · 총 ${directory.meetings.length}회`}
            >
              {directory.meetings.length ? (
                <>
                  <div className={styles["meetings-table-view"]}>
                    <MeetingDirectoryTable directory={directory} now={now} />
                  </div>
                  <div className={styles["meetings-mobile-list-view"]}>
                    <MeetingMobileList
                      meetings={directory.meetings}
                      renderActions={(meeting) => (
                        <MeetingLifecycleControls
                          {...getLifecycleControlProps(directory, meeting, now)}
                          meeting={meeting}
                        />
                      )}
                    />
                  </div>
                </>
              ) : null}
            </DataPanel>
          </>
        }
        summary={
          <SummaryGrid aria-label="정모 요약" columns={4}>
            <SummaryCard label="전체" value={`${directory.summary.total}회`} />
            <SummaryCard label="예정" value={`${directory.summary.scheduled}회`} />
            <SummaryCard label="완료" value={`${directory.summary.completed}회`} />
            <SummaryCard label="취소" value={`${directory.summary.cancelled}회`} />
          </SummaryGrid>
        }
        title="정모 관리"
      />

      {selection && !modalError ? (
        <MeetingRosterModal
          adHocCandidates={selection.adHocCandidates}
          attendanceStarted={isMeetingStarted(selection.meeting, now)}
          canManageAttendance={directory.canManageAttendance}
          closeHref={closeHref}
          lifecycleEvents={selection.lifecycleEvents}
          meeting={selection.meeting}
          onAddAdHocMember={directory.canManageAttendance ? async (memberId) => {
            "use server";
            const result = await addMeetingAdHocMember({
              meetingId: selection.meeting.id,
              memberId,
            });
            return result.status === "saved"
              ? { status: "saved" as const }
              : {
                  status: "error" as const,
                  message: result.status === "error"
                    ? result.message
                    : "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
                };
          } : undefined}
          onRemoveAdHocMember={directory.canManageAttendance ? async (memberId) => {
            "use server";
            const result = await removeMeetingAdHocMember({
              meetingId: selection.meeting.id,
              memberId,
            });
            return result.status === "saved"
              ? { status: "saved" as const }
              : {
                  status: "error" as const,
                  message: result.status === "error"
                    ? result.message
                    : "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
                };
          } : undefined}
          targets={selection.targets}
        />
      ) : null}
    </>
  );
}
