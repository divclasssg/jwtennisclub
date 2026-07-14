"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/atoms";
import { classNames } from "@/components/ui/class-names";
import styles from "./Molecules.module.scss";

type ModalDialogProps = {
  children: ReactNode;
  closeHref?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  size?: "default" | "large";
  title: ReactNode;
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function ModalDialog({
  children,
  closeHref,
  initialFocusRef,
  size = "default",
  title,
}: ModalDialogProps) {
  const router = useRouter();
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const returnFocus = useCallback(() => {
    if (openerRef.current?.isConnected) {
      openerRef.current.focus();
    }
  }, []);

  const close = useCallback(() => {
    if (closeHref) {
      router.replace(closeHref);
    } else {
      router.back();
    }
    returnFocus();
  }, [closeHref, returnFocus, router]);

  useEffect(() => {
    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const initialFocus =
      initialFocusRef?.current ??
      panelRef.current?.querySelector<HTMLElement>(focusableSelector) ??
      panelRef.current;
    initialFocus?.focus();

    return returnFocus;
  }, [initialFocusRef, returnFocus]);

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key !== "Tab" || !panelRef.current) {
      return;
    }

    const focusableElements = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(focusableSelector),
    ).filter((element) => element.getAttribute("aria-hidden") !== "true");
    const firstElement = focusableElements[0];
    const lastElement = focusableElements.at(-1);

    if (!firstElement || !lastElement) {
      event.preventDefault();
      panelRef.current.focus();
      return;
    }

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return (
    <div className={styles["modal-root"]}>
      <button
        aria-label="모달 닫기"
        className={styles["modal-backdrop"]}
        onClick={close}
        type="button"
      />
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={classNames(
          styles["modal-panel"],
          size === "large" && styles["modal-panel-large"],
        )}
        onKeyDown={handleDialogKeyDown}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles["modal-header"]}>
          <h2 className={styles["modal-title"]} id={titleId}>
            {title}
          </h2>
          <Button
            onClick={close}
            size="compact"
            type="button"
            variant="secondary"
          >
            닫기
          </Button>
        </header>
        <div className={styles["modal-body"]}>{children}</div>
      </section>
    </div>
  );
}
