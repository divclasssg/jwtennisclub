"use client";

import { Button } from "@/components/atoms";

import styles from "./page.module.scss";

export default function DashboardError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <section
      className={styles["dashboard-error"]}
      aria-labelledby="dashboard-error-title"
      role="alert"
    >
      <h2 id="dashboard-error-title">대시보드를 불러오지 못했습니다</h2>
      <p>잠시 후 다시 시도해 주세요.</p>
      <Button type="button" onClick={unstable_retry}>
        다시 시도
      </Button>
    </section>
  );
}
