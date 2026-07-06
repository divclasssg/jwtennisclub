"use client";

import { useId, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/atoms";
import styles from "./Molecules.module.scss";

type ModalDialogProps = {
  children: ReactNode;
  title: ReactNode;
};

export function ModalDialog({ children, title }: ModalDialogProps) {
  const router = useRouter();
  const titleId = useId();
  const close = () => router.back();

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
        className={styles["modal-panel"]}
        role="dialog"
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
