"use client";

import { useId, useState } from "react";
import { Button, SelectInput, TextInput } from "@/components/atoms";
import {
  ATTENDANCE_STATUSES,
  RSVP_STATUSES,
  type AttendanceStatus,
  type MeetingDirectoryTarget,
  type MeetingStatus,
  type RsvpStatus,
} from "./meeting-model";
import {
  meetingRowMutationResultSchema,
  type SafeMeetingRow,
} from "./meeting-row-contract";
import {
  ATTENDANCE_STATUS_LABELS,
  RSVP_STATUS_LABELS,
} from "./meeting-presentation";
import styles from "./MeetingRoster.module.scss";

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

const genericErrorMessage = "요청을 처리하지 못했습니다. 다시 시도해 주세요.";

function parseMutationResult(value: unknown) {
  const parsed = meetingRowMutationResultSchema.safeParse(value);
  if (!parsed.success) {
    return { status: "error", message: genericErrorMessage } as const;
  }
  if (parsed.data.status === "error") {
    return {
      status: "error",
      message: parsed.data.message.slice(0, 200),
    } as const;
  }
  return parsed.data;
}

export function MeetingRosterRow({
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

  const isScheduled = meetingStatus === "scheduled";
  const editable =
    canManage &&
    isScheduled &&
    (mode === "rsvp" || attendanceStarted);
  const recordedState = confirmed.hasRecordedState || target.hasRecordedState;
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
      hasRecordedState: true,
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
        setRequestState("saved");
        setMessage(`${target.memberNameSnapshot} 저장됨`);
        return;
      }

      if (response.ok && result.status === "conflict") {
        applyServerRow(result.row);
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

  function resetFeedback() {
    if (requestState !== "saving") {
      setRequestState("idle");
      setMessage("");
      setRetryAttempt(null);
    }
  }

  function validateArrivalTime(value: string) {
    if (!value) {
      return `${target.memberNameSnapshot} 회원의 실제 도착 시간을 입력해 주세요.`;
    }
    const meetingStart = meetingStartTime?.slice(0, 5);
    const meetingEnd = meetingEndTime?.slice(0, 5);
    if (
      (meetingStart !== undefined && value <= meetingStart) ||
      (meetingEnd !== undefined && value > meetingEnd)
    ) {
      return `${target.memberNameSnapshot} 회원의 실제 도착 시간은 시작 후 종료 이내여야 합니다.`;
    }
    return null;
  }

  function handleRsvpChange(nextStatus: RsvpStatus) {
    setRsvpDraft(nextStatus);
    resetFeedback();
    void save({ kind: "rsvp", rsvpStatus: nextStatus });
  }

  function handleAttendanceChange(nextStatus: AttendanceStatus) {
    setAttendanceDraft(nextStatus);
    resetFeedback();
    if (nextStatus === "late") {
      setArrivalDraft("");
      setRequestState("error");
      setRetryAttempt(null);
      setMessage(
        `${target.memberNameSnapshot} 회원의 실제 도착 시간을 입력해 주세요.`,
      );
      return;
    }
    setArrivalDraft("");
    void save({
      kind: "attendance",
      attendanceStatus: nextStatus,
      arrivalTime: null,
    });
  }

  function handleArrivalChange(value: string) {
    setArrivalDraft(value);
    const error = validateArrivalTime(value);
    if (error) {
      setRequestState("error");
      setRetryAttempt(null);
      setMessage(error);
      return;
    }
    resetFeedback();
    void save({
      kind: "attendance",
      attendanceStatus: "late",
      arrivalTime: value,
    });
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

      <div className={styles["row-form"]}>
        <label className={styles["row-field"]}>
          <span>{`${target.memberNameSnapshot} ${domainLabel}`}</span>
          {mode === "rsvp" ? (
            <SelectInput
              aria-label={`${target.memberNameSnapshot} 사전 참석`}
              disabled={!editable || saving}
              onChange={(event) =>
                handleRsvpChange(event.target.value as RsvpStatus)}
              value={rsvpDraft}
            >
              {RSVP_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {RSVP_STATUS_LABELS[status]}
                </option>
              ))}
            </SelectInput>
          ) : (
            <SelectInput
              aria-label={`${target.memberNameSnapshot} 실제 출석`}
              disabled={!editable || saving}
              onChange={(event) =>
                handleAttendanceChange(event.target.value as AttendanceStatus)}
              value={attendanceDraft}
            >
              {ATTENDANCE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {ATTENDANCE_STATUS_LABELS[status]}
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
              onChange={(event) => handleArrivalChange(event.target.value)}
              type="time"
              value={arrivalDraft}
            />
          </label>
        ) : null}

        {retryAttempt || canRemove ? (
          <div className={styles["row-actions"]}>
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
        ) : null}
      </div>

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
