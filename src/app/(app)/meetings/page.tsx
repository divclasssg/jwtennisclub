import { notFound } from "next/navigation";
import { ActionLink, Badge, Button, TextInput } from "@/components/atoms";
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
import { getKstPeriodMonth } from "@/features/meetings/meeting-calendar";
import type { MeetingDirectoryRow } from "@/features/meetings/meeting-model";
import {
  formatMeetingTime,
  getMeetingKindPresentation,
  getMeetingStatusPresentation,
} from "@/features/meetings/meeting-presentation";
import { canonicalizeScheduleReturnTo } from "@/features/meetings/meeting-return-path";
import { MeetingRosterModal } from "@/features/meetings/MeetingRosterModal";
import {
  addMeetingAdHocMember,
  removeMeetingAdHocMember,
} from "./actions";
import { MeetingLifecycleControls } from "./MeetingLifecycleControls";
import { MeetingManagementDisclosure } from "./MeetingManagementDisclosure";
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

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getCurrentKstMonth() {
  return getKstPeriodMonth().slice(0, 7);
}

function normalizeMonth(value: string | undefined) {
  return value && MONTH_PATTERN.test(value) ? value : getCurrentKstMonth();
}

function formatPeriodMonth(periodMonth: string) {
  const [year, month] = periodMonth.split("-");
  return `${year}년 ${Number(month)}월`;
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

function getLifecycleControlPropsByMeetingId(
  directory: MeetingDirectoryPage,
  now: number,
) {
  const lightningByRegularMeeting = new Map<
    string,
    { hasActiveLightning: boolean; hasLightningHistory: boolean }
  >();
  for (const meeting of directory.meetings) {
    if (!meeting.linkedRegularMeetingId) continue;
    const current = lightningByRegularMeeting.get(meeting.linkedRegularMeetingId);
    lightningByRegularMeeting.set(meeting.linkedRegularMeetingId, {
      hasActiveLightning:
        current?.hasActiveLightning || meeting.status !== "cancelled",
      hasLightningHistory: true,
    });
  }

  return new Map(
    directory.meetings.map((meeting) => {
      const lightning = lightningByRegularMeeting.get(meeting.id);
      return [
        meeting.id,
        {
          attendanceEnded: isMeetingEnded(meeting, now),
          canManageAttendance: directory.canManageAttendance,
          canManageMeeting: directory.canManageMeeting,
          hasActiveLightning: lightning?.hasActiveLightning ?? false,
          hasLightningHistory: lightning?.hasLightningHistory ?? false,
        },
      ];
    }),
  );
}

function MeetingDirectoryTable({
  directory,
  lifecycleProps,
}: {
  directory: MeetingDirectoryPage;
  lifecycleProps: ReturnType<typeof getLifecycleControlPropsByMeetingId>;
}) {
  return (
    <DataTable>
      <thead>
        <tr>
          <th scope="col">회차</th>
          <th scope="col">일시</th>
          <th scope="col">장소</th>
          <th scope="col">상태</th>
          <th scope="col">사전 참석</th>
          <th scope="col">출석</th>
          <th scope="col">명단</th>
          <th scope="col">관리</th>
        </tr>
      </thead>
      <tbody>
        {directory.meetings.map((meeting) => (
          <tr key={meeting.id}>
            <th scope="row">
              <span className={styles["meeting-title-cell"]}>
                <span>{meeting.title}</span>
                <Badge tone={getMeetingKindPresentation(meeting.meetingKind).tone}>
                  {getMeetingKindPresentation(meeting.meetingKind).label}
                </Badge>
              </span>
            </th>
            <td>
              <span className={styles["meeting-datetime-cell"]}>
                <span>{meeting.meetingDate}</span>
                <span>{formatMeetingTime(meeting.startTime)}–{formatMeetingTime(meeting.endTime)}</span>
              </span>
            </td>
            <td>{meeting.location ?? "미정"}</td>
            <td>
              <Badge tone={getMeetingStatusPresentation(meeting.status).tone}>
                {getMeetingStatusPresentation(meeting.status).label}
              </Badge>
            </td>
            <td>{formatRsvpCounts(meeting)}</td>
            <td>{formatAttendanceCounts(meeting)}</td>
            <td>
              {meeting.counts ? (
                <ActionLink
                  aria-label={`${meeting.title} 명단 보기`}
                  href={getMeetingLink(meeting)}
                  size="compact"
                  variant="secondary"
                >
                  명단
                </ActionLink>
              ) : (
                <span className={styles["meeting-roster-unavailable"]}>
                  <strong>명단 준비 전</strong>
                  <span>전월 마지막 7일에 준비</span>
                </span>
              )}
            </td>
            <td>
              {directory.canManageMeeting ? (
                <MeetingManagementDisclosure meetingTitle={meeting.title}>
                  <MeetingLifecycleControls
                    {...lifecycleProps.get(meeting.id)!}
                    meeting={meeting}
                  />
                </MeetingManagementDisclosure>
              ) : null}
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
  const lifecycleProps = getLifecycleControlPropsByMeetingId(directory, now);
  const selection = directory.selectedMeeting;

  return (
    <>
      <ManagementPageTemplate
        filters={
          <FilterBar aria-label="정모 월 필터" layout="single-control">
            <FormField label="조회 월">
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
                    <MeetingDirectoryTable
                      directory={directory}
                      lifecycleProps={lifecycleProps}
                    />
                  </div>
                  <div className={styles["meetings-mobile-list-view"]}>
                    <MeetingMobileList
                      meetings={directory.meetings}
                      renderActions={(meeting) => directory.canManageMeeting ? (
                        <MeetingManagementDisclosure meetingTitle={meeting.title}>
                          <MeetingLifecycleControls
                            {...lifecycleProps.get(meeting.id)!}
                            meeting={meeting}
                          />
                        </MeetingManagementDisclosure>
                      ) : null}
                    />
                  </div>
                </>
              ) : null}
            </DataPanel>
          </>
        }
        summary={
          <SummaryGrid
            aria-label="정모 요약"
            className={styles["meeting-summary-grid"]}
            columns={4}
          >
            <SummaryCard
              className={styles["meeting-summary-card"]}
              label="전체"
              value={`${directory.summary.total}회`}
            />
            <SummaryCard
              className={styles["meeting-summary-card"]}
              label="예정"
              value={`${directory.summary.scheduled}회`}
            />
            <SummaryCard
              className={styles["meeting-summary-card"]}
              label="완료"
              value={`${directory.summary.completed}회`}
            />
            <SummaryCard
              className={styles["meeting-summary-card"]}
              label="취소"
              value={`${directory.summary.cancelled}회`}
            />
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
