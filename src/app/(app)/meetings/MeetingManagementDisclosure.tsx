"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/atoms";
import styles from "./page.module.scss";

type MeetingManagementDisclosureProps = {
  children: ReactNode;
  meetingTitle: string;
};

export function MeetingManagementDisclosure({
  children,
  meetingTitle,
}: MeetingManagementDisclosureProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);

  return (
    <div className={styles["meeting-management-disclosure"]}>
      <Button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={`${meetingTitle} 관리 ${open ? "닫기" : "열기"}`}
        onClick={() => setOpen((current) => !current)}
        size="compact"
        type="button"
        variant="secondary"
      >
        관리
      </Button>
      {open ? (
        <div
          aria-label={`${meetingTitle} 회차 관리`}
          className={styles["meeting-management-panel"]}
          id={panelId}
          role="region"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
