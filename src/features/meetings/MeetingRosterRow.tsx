"use client";

import { useId, useState, type FormEvent } from "react";
import { Button, SelectInput, TextInput } from "@/components/atoms";
import {
  ATTENDANCE_STATUSES,
  RSVP_STATUSES,
  type AttendanceStatus,
  type MeetingDirectoryTarget,
  type MeetingStatus,
  type RsvpStatus,
} from "./meeting-model";
import styles from "./MeetingRoster.module.scss";

type SafeMeetingRow = {
  meetingId: string;
  memberId: string;
  rsvpStatus: RsvpStatus;
  attendanceStatus: AttendanceStatus;
  arrivalTime: string | null;
  rsvpUpdatedAt: string;
  attendanceUpdatedAt: string;
};

type SaveAttempt =
  | { kind: "rsvp"; rsvpStatus: RsvpStatus }
  | {
      kind: "attendance";
      attendanceStatus: AttendanceStatus;
      arrivalTime: string | null;
    };

type MeetingRosterRowProps = {
  attendanceStarted?: boolean;
  canManage: boolean;
  meetingEndTime?: string;
  meetingId: string;
  meetingStartTime?: string;
  meetingStatus: MeetingStatus;
  mode: "rsvp" | "attendance";
  onRemove?: () => Promise<void> | void;
  onRowConfirmed?: (row: SafeMeetingRow) => void;
  target: MeetingDirectoryTarget;
};

type RequestState = "idle" | "saving" | "saved" | "error";

const rsvpLabels: Readonly<Record<RsvpStatus, string>> = {
  unanswered: "미응답",
  attending: "참석",
  late: "늦참",
  declined: "불참",
};
const attendanceLabels: Readonly<Record<AttendanceStatus, string>> = {
  unchecked: "미체크",
  present: "출석",
  late: "지각",
  absent: "결석",
};
const genericErrorMessage = "요청을 처리하지 못했습니다. 다시 시도해 주세요.";

function includesValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function parseSafeRow(value: unknown): SafeMeetingRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.meetingId !== "string" ||
    typeof row.memberId !== "string" ||
    !includesValue(RSVP_STATUSES, row.rsvpStatus) ||
    !includesValue(ATTENDANCE_STATUSES, row.attendanceStatus) ||
    (row.arrivalTime !== null && typeof row.arrivalTime !== "string") ||
    typeof row.rsvpUpdatedAt !== "string" ||
    typeof row.attendanceUpdatedAt !== "string"
  ) {
    return null;
  }

  return {
    meetingId: row.meetingId,
    memberId: row.memberId,
    rsvpStatus: row.rsvpStatus,
    attendanceStatus: row.attendanceStatus,
    arrivalTime: row.arrivalTime,
    rsvpUpdatedAt: row.rsvpUpdatedAt,
    attendanceUpdatedAt: row.attendanceUpdatedAt,
  };
}

function parseMutationResult(value: unknown) {
  if (!value || typeof value !== "object" || !("status" in value)) {
    return { status: "error", message: genericErrorMessage } as const;
  }

  const result = value as Record<string, unknown>;
  if (result.status === "error" && typeof result.message === "string") {
    return {
      status: "error",
      message: result.message.slice(0, 200),
    } as const;
  }

  const row = parseSafeRow(result.row);
  if ((result.status === "saved" || result.status === "conflict") && row) {
    return { status: result.status, row } as
      | { status: "saved"; row: SafeMeetingRow }
      | { status: "conflict"; row: SafeMeetingRow };
  }
  return { status: "error", message: genericErrorMessage } as const;
}

function MeetingRosterRowStateful({
  attendanceStarted = false,
  canManage,
  meetingEndTime,
  meetingId,
  meetingStartTime,
  meetingStatus,
  mode,
  onRemove,
  onRowConfirmed,
  target,
}: MeetingRosterRowProps) {
  const statusId = useId();
  const [confirmed, setConfirmed] = useState(target);
  const [rsvpDraft, setRsvpDraft] = useState(target.rsvpStatus);
  const [attendanceDraft, setAttendanceDraft] = useState(
    target.attendanceStatus,
  );
  const [arrivalDraft, setArrivalDraft] = useState(
    target.arrivalTime?.slice(0, 5) ?? "",
  );
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");
  const [retryAttempt, setRetryAttempt] = useState<SaveAttempt | null>(null);
  const [hasRecordedState, setHasRecordedState] = useState(
    target.hasRecordedState,
  );

  const isScheduled = meetingStatus === "scheduled";
  const editable =
    canManage &&
    isScheduled &&
    (mode === "rsvp" || attendanceStarted);
  const recordedState = hasRecordedState || target.hasRecordedState;
  const canRemove =
    target.targetOrigin === "ad_hoc" &&
    !recordedState &&
    canManage &&
    isScheduled &&
    Boolean(onRemove);
  const domainLabel = mode === "rsvp" ? "사전 참석" : "실제 출석";
  const saving = requestState === "saving";

  function applyServerRow(row: SafeMeetingRow) {
    setConfirmed((current) => ({
      ...current,
      rsvpStatus: row.rsvpStatus,
      attendanceStatus: row.attendanceStatus,
      arrivalTime: row.arrivalTime,
      rsvpUpdatedAt: row.rsvpUpdatedAt,
      attendanceUpdatedAt: row.attendanceUpdatedAt,
    }));
    setRsvpDraft(row.rsvpStatus);
    setAttendanceDraft(row.attendanceStatus);
    setArrivalDraft(row.arrivalTime?.slice(0, 5) ?? "");
    onRowConfirmed?.(row);
  }

  function restoreConfirmedDraft() {
    if (mode === "rsvp") {
      setRsvpDraft(confirmed.rsvpStatus);
    } else {
      setAttendanceDraft(confirmed.attendanceStatus);
      setArrivalDraft(confirmed.arrivalTime?.slice(0, 5) ?? "");
    }
  }

  async function save(attempt: SaveAttempt) {
    if (saving || !editable) return;

    setRequestState("saving");
    setMessage(`${target.memberNameSnapshot} 저장 중`);
    setRetryAttempt(null);

    const request =
      attempt.kind === "rsvp"
        ? {
            ...attempt,
            meetingId,
            memberId: target.memberId,
            expectedUpdatedAt: confirmed.rsvpUpdatedAt,
          }
        : {
            ...attempt,
            meetingId,
            memberId: target.memberId,
            expectedUpdatedAt: confirmed.attendanceUpdatedAt,
          };

    try {
      const response = await fetch("/api/meetings/rows", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const result = parseMutationResult(await response.json());

      if (response.ok && result.status === "saved") {
        applyServerRow(result.row);
        setHasRecordedState(true);
        setRequestState("saved");
        setMessage(`${target.memberNameSnapshot} 저장됨`);
        return;
      }

      if (response.ok && result.status === "conflict") {
        applyServerRow(result.row);
        setHasRecordedState(true);
        setRetryAttempt(attempt);
        setRequestState("error");
        setMessage(
          "다른 운영진이 먼저 변경했습니다. 최신 값으로 복원했습니다.",
        );
        return;
      }

      restoreConfirmedDraft();
      setRetryAttempt(attempt);
      setRequestState("error");
      setMessage(result.status === "error" ? result.message : genericErrorMessage);
    } catch {
      restoreConfirmedDraft();
      setRetryAttempt(attempt);
      setRequestState("error");
      setMessage(genericErrorMessage);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "rsvp") {
      void save({ kind: "rsvp", rsvpStatus: rsvpDraft });
      return;
    }

    if (attendanceDraft === "late" && !arrivalDraft) {
      setRequestState("error");
      setRetryAttempt(null);
      setMessage(
        `${target.memberNameSnapshot} 회원의 실제 도착 시간을 입력해 주세요.`,
      );
      return;
    }

    const meetingStart = meetingStartTime?.slice(0, 5);
    const meetingEnd = meetingEndTime?.slice(0, 5);
    if (
      attendanceDraft === "late" &&
      ((meetingStart !== undefined && arrivalDraft <= meetingStart) ||
        (meetingEnd !== undefined && arrivalDraft > meetingEnd))
    ) {
      setRequestState("error");
      setRetryAttempt(null);
      setMessage(
        `${target.memberNameSnapshot} 회원의 실제 도착 시간은 시작 후 종료 이내여야 합니다.`,
      );
      return;
    }

    void save({
      kind: "attendance",
      attendanceStatus: attendanceDraft,
      arrivalTime: attendanceDraft === "late" ? arrivalDraft : null,
    });
  }

  function resetFeedback() {
    if (requestState !== "saving") {
      setRequestState("idle");
      setMessage("");
      setRetryAttempt(null);
    }
  }

  return (
    <article
      aria-label={`${target.memberNameSnapshot} ${domainLabel} 행`}
      className={styles["roster-row"]}
    >
      <div className={styles["member-summary"]}>
        <strong>{target.memberNameSnapshot}</strong>
        <span>
          {target.memberCodeSnapshot} · {target.groupCodeSnapshot ?? "그룹 없음"}
        </span>
        {target.targetOrigin === "ad_hoc" ? <span>임시 대상</span> : null}
      </div>

      <form className={styles["row-form"]} onSubmit={handleSubmit}>
        <label className={styles["row-field"]}>
          <span>{`${target.memberNameSnapshot} ${domainLabel}`}</span>
          {mode === "rsvp" ? (
            <SelectInput
              aria-label={`${target.memberNameSnapshot} 사전 참석`}
              disabled={!editable || saving}
              onChange={(event) => {
                setRsvpDraft(event.target.value as RsvpStatus);
                resetFeedback();
              }}
              value={rsvpDraft}
            >
              {RSVP_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {rsvpLabels[status]}
                </option>
              ))}
            </SelectInput>
          ) : (
            <SelectInput
              aria-label={`${target.memberNameSnapshot} 실제 출석`}
              disabled={!editable || saving}
              onChange={(event) => {
                setAttendanceDraft(event.target.value as AttendanceStatus);
                if (event.target.value !== "late") setArrivalDraft("");
                resetFeedback();
              }}
              value={attendanceDraft}
            >
              {ATTENDANCE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {attendanceLabels[status]}
                </option>
              ))}
            </SelectInput>
          )}
        </label>

        {mode === "attendance" && attendanceDraft === "late" ? (
          <label className={styles["row-field"]}>
            <span>{`${target.memberNameSnapshot} 실제 도착 시간`}</span>
            <TextInput
              aria-describedby={requestState === "error" ? statusId : undefined}
              aria-label={`${target.memberNameSnapshot} 실제 도착 시간`}
              disabled={!editable || saving}
              max={meetingEndTime}
              min={meetingStartTime}
              onChange={(event) => {
                setArrivalDraft(event.target.value);
                resetFeedback();
              }}
              type="time"
              value={arrivalDraft}
            />
          </label>
        ) : null}

        <div className={styles["row-actions"]}>
          <Button
            aria-label={`${target.memberNameSnapshot} ${domainLabel} 저장`}
            disabled={!editable || saving}
            size="compact"
            type="submit"
          >
            {saving ? "저장 중" : "저장"}
          </Button>
          {retryAttempt ? (
            <Button
              aria-label={`${target.memberNameSnapshot} ${domainLabel} 재시도`}
              disabled={!editable || saving}
              onClick={() => void save(retryAttempt)}
              size="compact"
              type="button"
              variant="secondary"
            >
              재시도
            </Button>
          ) : null}
          {canRemove ? (
            <Button
              aria-label={`${target.memberNameSnapshot} 임시 대상 제거`}
              disabled={saving}
              onClick={() => void onRemove?.()}
              size="compact"
              type="button"
              variant="danger"
            >
              제거
            </Button>
          ) : null}
        </div>
      </form>

      {target.targetOrigin === "ad_hoc" && recordedState ? (
        <p className={styles["row-note"]}>기록이 있어 제거할 수 없습니다.</p>
      ) : null}
      <p
        aria-live="polite"
        className={styles["row-status"]}
        data-state={requestState}
        id={statusId}
        role={requestState === "error" ? "alert" : undefined}
      >
        {message}
      </p>
    </article>
  );
}

export function MeetingRosterRow(props: MeetingRosterRowProps) {
  return <MeetingRosterRowStateful {...props} />;
}
