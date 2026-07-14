"use client";

import { useState, type FormEvent } from "react";
import { Button, TextInput } from "@/components/atoms";
import type { MeetingDirectoryRow } from "@/features/meetings/meeting-model";
import {
  cancelClubMeeting,
  closeClubMeetingAttendance,
  createLightningClubMeeting,
  reopenClubMeetingAttendance,
  restoreClubMeeting,
  updateClubMeetingLocation,
  type MeetingActionResult,
} from "./actions";
import styles from "./page.module.scss";

type MeetingLifecycleControlsProps = {
  attendanceEnded: boolean;
  canManageAttendance: boolean;
  canManageMeeting: boolean;
  hasActiveLightning: boolean;
  hasLightningHistory: boolean;
  meeting: MeetingDirectoryRow;
};

const genericErrorMessage =
  "요청을 처리하지 못했습니다. 다시 시도해 주세요.";

function safeResultMessage(result: MeetingActionResult) {
  return result.status === "error"
    ? result.message.slice(0, 200)
    : genericErrorMessage;
}

export function MeetingLifecycleControls({
  attendanceEnded,
  canManageAttendance,
  canManageMeeting,
  hasActiveLightning,
  hasLightningHistory,
  meeting,
}: MeetingLifecycleControlsProps) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageState, setMessageState] = useState<"idle" | "saved" | "error">("idle");
  const pending = pendingAction !== null;

  async function runAction(
    actionName: string,
    successMessage: string,
    action: () => Promise<MeetingActionResult>,
  ) {
    if (pending) return;
    setPendingAction(actionName);
    setMessageState("idle");
    setMessage(`${actionName} 처리 중입니다.`);

    try {
      const result = await action();
      if (result.status === "saved") {
        setMessageState("saved");
        setMessage(successMessage);
      } else {
        setMessageState("error");
        setMessage(safeResultMessage(result));
      }
    } catch {
      setMessageState("error");
      setMessage(genericErrorMessage);
    } finally {
      setPendingAction(null);
    }
  }

  function handleLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const location = String(new FormData(event.currentTarget).get("location") ?? "");
    void runAction("장소 저장", "장소를 변경했습니다.", () =>
      updateClubMeetingLocation({ meetingId: meeting.id, location }),
    );
  }

  function handleCancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    if (!reason) {
      setMessageState("error");
      setMessage("취소 사유를 입력해 주세요.");
      return;
    }
    void runAction("정모 취소", "정모를 취소했습니다.", () =>
      cancelClubMeeting({ meetingId: meeting.id, reason }),
    );
  }

  function handleLightning(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const meetingDate = String(data.get("meetingDate") ?? "");
    const startTime = String(data.get("startTime") ?? "");
    const endTime = String(data.get("endTime") ?? "");
    const location = String(data.get("location") ?? "");
    if (!meetingDate || !startTime || !endTime || endTime <= startTime) {
      setMessageState("error");
      setMessage("번개 날짜와 시작·종료 시간을 확인해 주세요.");
      return;
    }
    void runAction("번개 생성", "대체 번개를 생성했습니다.", () =>
      createLightningClubMeeting({
        linkedRegularMeetingId: meeting.id,
        meetingDate,
        startTime,
        endTime,
        location,
      }),
    );
  }

  if (!canManageMeeting) {
    return <span className={styles["meeting-read-only"]}>조회 전용</span>;
  }

  const canClose = meeting.status === "scheduled" &&
    attendanceEnded &&
    canManageAttendance;
  const canReopen = meeting.status === "completed" && canManageAttendance;
  const canRestore = meeting.status === "cancelled" &&
    meeting.meetingKind === "regular" &&
    !hasActiveLightning;
  const canCreateLightning = meeting.status === "cancelled" &&
    meeting.meetingKind === "regular" &&
    !hasLightningHistory;

  return (
    <div
      aria-label={`${meeting.title} 회차 관리`}
      className={styles["meeting-lifecycle-controls"]}
      role="group"
    >
      {meeting.status === "scheduled" ? (
        <>
          {meeting.meetingKind === "regular" ? (
            <form className={styles["meeting-lifecycle-form"]} onSubmit={handleLocation}>
              <label className={styles["meeting-lifecycle-field"]}>
                <span>변경 장소</span>
                <TextInput
                  aria-label={`${meeting.title} 변경 장소`}
                  defaultValue={meeting.location ?? ""}
                  name="location"
                />
              </label>
              <Button
                aria-label={`${meeting.title} 장소 저장`}
                disabled={pending}
                size="compact"
                type="submit"
                variant="secondary"
              >
                장소 저장
              </Button>
            </form>
          ) : null}
          <form className={styles["meeting-lifecycle-form"]} onSubmit={handleCancel}>
            <label className={styles["meeting-lifecycle-field"]}>
              <span>취소 사유</span>
              <TextInput
                aria-label={`${meeting.title} 취소 사유`}
                name="reason"
                required
              />
            </label>
            <Button
              aria-label={`${meeting.title} 취소`}
              disabled={pending}
              size="compact"
              type="submit"
              variant="danger"
            >
              취소
            </Button>
          </form>
        </>
      ) : null}

      {canClose ? (
        <Button
          aria-label={`${meeting.title} 출석 마감`}
          disabled={pending}
          onClick={() => void runAction(
            "출석 마감",
            "출석을 마감했습니다.",
            () => closeClubMeetingAttendance({ meetingId: meeting.id }),
          )}
          size="compact"
          type="button"
        >
          출석 마감
        </Button>
      ) : null}

      {canReopen ? (
        <Button
          aria-label={`${meeting.title} 출석 재개`}
          disabled={pending}
          onClick={() => void runAction(
            "출석 재개",
            "출석 입력을 다시 열었습니다.",
            () => reopenClubMeetingAttendance({ meetingId: meeting.id }),
          )}
          size="compact"
          type="button"
          variant="secondary"
        >
          출석 재개
        </Button>
      ) : null}

      {canRestore ? (
        <Button
          aria-label={`${meeting.title} 취소 복구`}
          disabled={pending}
          onClick={() => void runAction(
            "취소 복구",
            "정모 취소를 복구했습니다.",
            () => restoreClubMeeting({ meetingId: meeting.id }),
          )}
          size="compact"
          type="button"
          variant="secondary"
        >
          취소 복구
        </Button>
      ) : null}

      {canCreateLightning ? (
        <form className={styles["meeting-lifecycle-form"]} onSubmit={handleLightning}>
          <div className={styles["meeting-lightning-fields"]}>
            <label className={styles["meeting-lifecycle-field"]}>
              <span>번개 날짜</span>
              <TextInput
                aria-label={`${meeting.title} 번개 날짜`}
                name="meetingDate"
                required
                type="date"
              />
            </label>
            <label className={styles["meeting-lifecycle-field"]}>
              <span>시작 시간</span>
              <TextInput
                aria-label={`${meeting.title} 번개 시작 시간`}
                name="startTime"
                required
                type="time"
              />
            </label>
            <label className={styles["meeting-lifecycle-field"]}>
              <span>종료 시간</span>
              <TextInput
                aria-label={`${meeting.title} 번개 종료 시간`}
                name="endTime"
                required
                type="time"
              />
            </label>
            <label className={styles["meeting-lifecycle-field"]}>
              <span>번개 장소</span>
              <TextInput
                aria-label={`${meeting.title} 번개 장소`}
                name="location"
              />
            </label>
          </div>
          <Button
            aria-label={`${meeting.title} 번개 생성`}
            disabled={pending}
            size="compact"
            type="submit"
          >
            번개 생성
          </Button>
        </form>
      ) : null}

      <p
        aria-live="polite"
        className={styles["meeting-lifecycle-status"]}
        data-state={messageState}
        role={messageState === "error" ? "alert" : undefined}
      >
        {message}
      </p>
    </div>
  );
}
