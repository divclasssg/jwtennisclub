"use client";

import {
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Button, SelectInput, TextInput } from "@/components/atoms";
import { ModalDialog } from "@/components/molecules";
import type {
  AttendanceStatus,
  MeetingAdHocCandidate,
  MeetingDirectoryRow,
  MeetingDirectoryTarget,
  MeetingLifecycleEventDisplay,
  RsvpStatus,
} from "./meeting-model";
import { MeetingRosterRow } from "./MeetingRosterRow";
import styles from "./MeetingRoster.module.scss";

type ConfirmedRow = {
  memberId: string;
  rsvpStatus: RsvpStatus;
  attendanceStatus: AttendanceStatus;
  arrivalTime: string | null;
  rsvpUpdatedAt: string;
  attendanceUpdatedAt: string;
};

export type MeetingRosterMutationResult =
  | { status: "saved"; target?: MeetingDirectoryTarget }
  | { status: "error"; message: string };

type MeetingRosterModalProps = {
  adHocCandidates: MeetingAdHocCandidate[];
  attendanceStarted: boolean;
  canManageAttendance: boolean;
  closeHref: string;
  lifecycleEvents: MeetingLifecycleEventDisplay[];
  meeting: MeetingDirectoryRow;
  onAddAdHocMember?: (
    memberId: string,
  ) => MeetingRosterMutationResult | Promise<MeetingRosterMutationResult>;
  onRemoveAdHocMember?: (
    memberId: string,
  ) => MeetingRosterMutationResult | Promise<MeetingRosterMutationResult>;
  targets: MeetingDirectoryTarget[];
};

type RosterMode = "rsvp" | "attendance";
type RosterFilter = "all" | RsvpStatus | AttendanceStatus;

const tabs: ReadonlyArray<{ mode: RosterMode; label: string }> = [
  { mode: "rsvp", label: "사전 참석" },
  { mode: "attendance", label: "출석 체크" },
];

const rsvpSummary: ReadonlyArray<{ status: RsvpStatus; label: string }> = [
  { status: "unanswered", label: "미응답" },
  { status: "attending", label: "참석" },
  { status: "late", label: "늦참" },
  { status: "declined", label: "불참" },
];

const attendanceSummary: ReadonlyArray<{
  status: AttendanceStatus;
  label: string;
}> = [
  { status: "unchecked", label: "미체크" },
  { status: "present", label: "출석" },
  { status: "late", label: "지각" },
  { status: "absent", label: "결석" },
];

const lifecycleLabels: Readonly<
  Record<MeetingLifecycleEventDisplay["eventType"], string>
> = {
  cancelled: "취소",
  restored: "취소 복구",
  attendance_closed: "출석 마감",
  attendance_reopened: "출석 재개",
  location_updated: "장소 변경",
  lightning_created: "번개 생성",
  ad_hoc_added: "임시 대상 추가",
  ad_hoc_removed: "임시 대상 제거",
};
const genericMutationMessage =
  "요청을 처리하지 못했습니다. 다시 시도해 주세요.";

function formatTime(value: string) {
  return value.slice(0, 5);
}

function formatOccurredAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatLifecycleDetails(details: Readonly<Record<string, unknown>>) {
  return Object.values(details)
    .filter(
      (value): value is string | number | boolean =>
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean",
    )
    .map(String)
    .join(" · ");
}

function safeMutationMessage(result: MeetingRosterMutationResult) {
  return result.status === "error"
    ? result.message.slice(0, 200)
    : genericMutationMessage;
}

function getRosterGuidance({
  attendanceStarted,
  canManageAttendance,
  meetingStatus,
  mode,
}: {
  attendanceStarted: boolean;
  canManageAttendance: boolean;
  meetingStatus: MeetingDirectoryRow["status"];
  mode: RosterMode;
}) {
  if (meetingStatus === "cancelled") {
    return "취소된 회차로 명단을 조회만 할 수 있습니다.";
  }
  if (meetingStatus === "completed") {
    return "출석이 마감된 회차로 명단을 조회만 할 수 있습니다.";
  }
  if (!canManageAttendance) {
    return "출석 관리 권한이 없어 명단을 조회만 할 수 있습니다.";
  }
  if (mode === "attendance" && !attendanceStarted) {
    return "정모 시작 이후에 출석을 입력할 수 있습니다.";
  }
  return null;
}

export function MeetingRosterModal({
  adHocCandidates,
  attendanceStarted,
  canManageAttendance,
  closeHref,
  lifecycleEvents,
  meeting,
  onAddAdHocMember,
  onRemoveAdHocMember,
  targets,
}: MeetingRosterModalProps) {
  const tabsId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [mode, setMode] = useState<RosterMode>("rsvp");
  const [targetQuery, setTargetQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<RosterFilter>("all");
  const [rowOverrides, setRowOverrides] = useState<
    Record<string, Partial<MeetingDirectoryTarget>>
  >({});
  const [addedTargets, setAddedTargets] = useState<MeetingDirectoryTarget[]>([]);
  const [removedTargetIds, setRemovedTargetIds] = useState<string[]>([]);
  const [hiddenCandidateIds, setHiddenCandidateIds] = useState<string[]>([]);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [candidateState, setCandidateState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [candidateMessage, setCandidateMessage] = useState("");

  const displayedTargets = useMemo(() => {
    const targetMemberIds = new Set(targets.map((target) => target.memberId));
    const removedMemberIds = new Set(removedTargetIds);
    const source = [
      ...targets,
      ...addedTargets.filter(
        (added) => !targetMemberIds.has(added.memberId),
      ),
    ];
    return source
      .filter((target) => !removedMemberIds.has(target.memberId))
      .map((target) => ({
        ...target,
        ...rowOverrides[target.memberId],
      }));
  }, [addedTargets, removedTargetIds, rowOverrides, targets]);

  const availableCandidates = useMemo(() => {
    const normalizedQuery = candidateQuery.trim().toLocaleLowerCase("ko-KR");
    const displayedMemberIds = new Set(
      displayedTargets.map((target) => target.memberId),
    );
    const hiddenMemberIds = new Set(hiddenCandidateIds);
    return adHocCandidates.filter((candidate) => {
      if (
        hiddenMemberIds.has(candidate.id) ||
        displayedMemberIds.has(candidate.id)
      ) {
        return false;
      }
      if (!normalizedQuery) return true;
      return [candidate.memberCode, candidate.name, candidate.groupCode ?? ""]
        .join(" ")
        .toLocaleLowerCase("ko-KR")
        .includes(normalizedQuery);
    });
  }, [
    adHocCandidates,
    candidateQuery,
    displayedTargets,
    hiddenCandidateIds,
  ]);

  const filteredTargets = useMemo(() => {
    const query = targetQuery.trim().toLocaleLowerCase("ko-KR");
    return displayedTargets.filter((target) => {
      const matchesQuery = !query || [
        target.memberCodeSnapshot,
        target.memberNameSnapshot,
      ]
        .join(" ")
        .toLocaleLowerCase("ko-KR")
        .includes(query);
      const currentStatus = mode === "rsvp"
        ? target.rsvpStatus
        : target.attendanceStatus;
      return matchesQuery &&
        (statusFilter === "all" || currentStatus === statusFilter);
    });
  }, [displayedTargets, mode, statusFilter, targetQuery]);

  const tabId = `${tabsId}-${mode}-tab`;
  const panelId = `${tabsId}-${mode}-panel`;
  const canChangeRoster = canManageAttendance && meeting.status === "scheduled";
  const selectedCandidate = adHocCandidates.find(
    (candidate) => candidate.id === selectedCandidateId,
  );

  function selectMode(nextMode: RosterMode) {
    setMode(nextMode);
    setStatusFilter("all");
  }

  function clearRosterFilters() {
    setTargetQuery("");
    setStatusFilter("all");
  }

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    selectMode(tabs[nextIndex].mode);
    tabRefs.current[nextIndex]?.focus();
  }

  function handleRowConfirmed(row: ConfirmedRow) {
    setRowOverrides((current) => ({
      ...current,
      [row.memberId]: {
        ...current[row.memberId],
        rsvpStatus: row.rsvpStatus,
        attendanceStatus: row.attendanceStatus,
        arrivalTime: row.arrivalTime,
        rsvpUpdatedAt: row.rsvpUpdatedAt,
        attendanceUpdatedAt: row.attendanceUpdatedAt,
        hasRecordedState: true,
      },
    }));
  }

  async function handleAddCandidate() {
    if (!selectedCandidate || !onAddAdHocMember || !canChangeRoster) return;
    setCandidateState("saving");
    setCandidateMessage("임시 대상을 추가하는 중입니다.");

    let result: MeetingRosterMutationResult;
    try {
      result = await onAddAdHocMember(selectedCandidate.id);
    } catch {
      setCandidateState("error");
      setCandidateMessage(genericMutationMessage);
      return;
    }
    if (result.status === "saved") {
      if (result.target) {
        setAddedTargets((current) => [
          ...current.filter((target) => target.memberId !== result.target!.memberId),
          result.target!,
        ]);
      }
      setRemovedTargetIds((current) =>
        current.filter((memberId) => memberId !== selectedCandidate.id),
      );
      setHiddenCandidateIds((current) => [...current, selectedCandidate.id]);
      setSelectedCandidateId("");
      setCandidateState("saved");
      setCandidateMessage(
        `${selectedCandidate.name} 임시 대상을 추가했습니다.`,
      );
      return;
    }

    setCandidateState("error");
    setCandidateMessage(safeMutationMessage(result));
  }

  async function handleRemoveCandidate(target: MeetingDirectoryTarget) {
    if (!onRemoveAdHocMember || !canChangeRoster) return;
    let result: MeetingRosterMutationResult;
    try {
      result = await onRemoveAdHocMember(target.memberId);
    } catch {
      setCandidateState("error");
      setCandidateMessage(genericMutationMessage);
      return;
    }
    if (result.status === "saved") {
      setRemovedTargetIds((current) => [...current, target.memberId]);
      setAddedTargets((current) =>
        current.filter((added) => added.memberId !== target.memberId),
      );
      setRowOverrides((current) =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([memberId]) => memberId !== target.memberId,
          ),
        ),
      );
      setHiddenCandidateIds((current) =>
        current.filter((candidateId) => candidateId !== target.memberId),
      );
      setCandidateState("saved");
      setCandidateMessage(
        `${target.memberNameSnapshot} 임시 대상을 제거했습니다.`,
      );
      return;
    }
    setCandidateState("error");
    setCandidateMessage(safeMutationMessage(result));
  }

  const guidance = getRosterGuidance({
    attendanceStarted,
    canManageAttendance,
    meetingStatus: meeting.status,
    mode,
  });

  return (
    <ModalDialog
      closeHref={closeHref}
      size="large"
      title={`${meeting.title} 명단`}
    >
      <div className={styles["roster-modal"]}>
        <section
          aria-label="회차 요약"
          className={styles["meeting-summary"]}
        >
          <strong>{meeting.meetingKind === "lightning" ? "번개" : "정모"}</strong>
          <span>{meeting.meetingDate}</span>
          <span>
            {formatTime(meeting.startTime)}–{formatTime(meeting.endTime)}
          </span>
          <span>{meeting.location ?? "장소 미정"}</span>
          <span>
            {meeting.status === "cancelled"
              ? "취소"
              : meeting.status === "completed"
                ? "마감"
                : "예정"}
          </span>
        </section>

        <div
          aria-label="명단 관리"
          className={styles["roster-tabs"]}
          role="tablist"
        >
          {tabs.map((tab, index) => {
            const selected = tab.mode === mode;
            return (
              <button
                aria-controls={`${tabsId}-${tab.mode}-panel`}
                aria-selected={selected}
                className={styles["roster-tab"]}
                id={`${tabsId}-${tab.mode}-tab`}
                key={tab.mode}
                onClick={() => selectMode(tab.mode)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <section
          aria-label={mode === "rsvp" ? "사전 참석 요약" : "출석 체크 요약"}
          className={styles["roster-summary"]}
          role="region"
        >
          {[
            { status: "all" as const, label: "전체", count: displayedTargets.length },
            ...(mode === "rsvp" ? rsvpSummary : attendanceSummary).map((item) => ({
              ...item,
              count: displayedTargets.filter((target) =>
                mode === "rsvp"
                  ? target.rsvpStatus === item.status
                  : target.attendanceStatus === item.status,
              ).length,
            })),
          ].map((item) => {
            return (
              <button
                aria-label={`${item.label} ${item.count}명 필터`}
                aria-pressed={statusFilter === item.status}
                className={styles["roster-summary-filter"]}
                key={item.status}
                onClick={() => setStatusFilter(item.status)}
                type="button"
              >
                <span>{item.label}</span>
                <strong>{item.count}명</strong>
              </button>
            );
          })}
        </section>

        <div className={styles["roster-search-toolbar"]}>
          <TextInput
            aria-label="명단 회원 검색"
            className={styles["roster-search-input"]}
            onChange={(event) => setTargetQuery(event.target.value)}
            placeholder="이름 또는 회원번호"
            type="search"
            value={targetQuery}
          />
        </div>

        {guidance ? (
          <p className={styles["roster-guidance"]}>{guidance}</p>
        ) : null}

        <div
          aria-labelledby={tabId}
          className={styles["roster-target-list"]}
          id={panelId}
          role="tabpanel"
          tabIndex={0}
        >
          {!displayedTargets.length ? (
            <p className={styles["empty-roster"]}>대상 회원이 없습니다.</p>
          ) : filteredTargets.length ? (
            filteredTargets.map((target) => (
              <MeetingRosterRow
                attendanceStarted={attendanceStarted}
                canManage={canManageAttendance}
                key={target.memberId}
                meetingEndTime={meeting.endTime}
                meetingId={meeting.id}
                meetingStartTime={meeting.startTime}
                meetingStatus={meeting.status}
                mode={mode}
                onRemove={
                  onRemoveAdHocMember
                    ? () => handleRemoveCandidate(target)
                    : undefined
                }
                onRowConfirmed={handleRowConfirmed}
                target={target}
              />
            ))
          ) : (
            <div className={styles["empty-roster"]}>
              <p>조건에 맞는 회원이 없습니다.</p>
              <Button onClick={clearRosterFilters} size="compact" type="button">
                필터 초기화
              </Button>
            </div>
          )}
        </div>

        {canChangeRoster && onAddAdHocMember ? (
          <details className={styles["ad-hoc-details"]}>
            <summary>
              임시 대상 추가 {displayedTargets.filter(
                (target) => target.targetOrigin === "ad_hoc",
              ).length}명
            </summary>
            <section
              aria-label="임시 대상 추가"
              className={styles["ad-hoc-panel"]}
            >
              <div className={styles["candidate-controls"]}>
                <label className={styles["candidate-field"]}>
                  <span>회원 검색</span>
                  <TextInput
                    aria-label="임시 대상 검색"
                    onChange={(event) => {
                      setCandidateQuery(event.target.value);
                      setSelectedCandidateId("");
                    }}
                    type="search"
                    value={candidateQuery}
                  />
                </label>
                <label className={styles["candidate-field"]}>
                  <span>추가할 회원</span>
                  <SelectInput
                    aria-label="임시 대상 후보"
                    onChange={(event) => setSelectedCandidateId(event.target.value)}
                    value={selectedCandidateId}
                  >
                    <option value="">회원을 선택하세요</option>
                    {availableCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.memberCode} · {candidate.name} ·{" "}
                        {candidate.groupCode ?? "그룹 없음"}
                      </option>
                    ))}
                  </SelectInput>
                </label>
                <Button
                  disabled={!selectedCandidateId || candidateState === "saving"}
                  onClick={() => void handleAddCandidate()}
                  type="button"
                >
                  임시 대상 추가
                </Button>
              </div>
              <p
                aria-live="polite"
                className={styles["candidate-status"]}
                data-state={candidateState}
                role={candidateState === "error" ? "alert" : undefined}
              >
                {candidateMessage}
              </p>
            </section>
          </details>
        ) : null}

        <details className={styles["history-details"]}>
          <summary>변경 이력 {lifecycleEvents.length}건</summary>
          {lifecycleEvents.length ? (
            <ol>
              {lifecycleEvents.map((event) => {
                const detail = formatLifecycleDetails(event.details);
                return (
                  <li key={event.id}>
                    <strong>{lifecycleLabels[event.eventType]}</strong>
                    <span>{event.actorDisplayName}</span>
                    <time dateTime={event.occurredAt}>
                      {formatOccurredAt(event.occurredAt)}
                    </time>
                    {event.reason ? <span>{event.reason}</span> : null}
                    {!event.reason && detail ? <span>{detail}</span> : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p>변경 이력이 없습니다.</p>
          )}
        </details>
      </div>
    </ModalDialog>
  );
}
