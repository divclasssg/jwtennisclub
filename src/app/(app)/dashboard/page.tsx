import styles from "./page.module.css";

const metrics = [
  { label: "회비 수입", value: "0원", note: "이번 달 입금 합계" },
  { label: "운영비 지출", value: "0원", note: "코트비, 공, 기타 비용" },
  { label: "미납 회원", value: "0명", note: "확인 대기" },
  { label: "정산 상태", value: "진행 중", note: "월말 확정 전" },
];

export default function DashboardPage() {
  return (
    <section className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.month}>2026년 7월</p>
          <h1>운영 대시보드</h1>
        </div>
        <p className={styles.summary}>
          회원, 회비, 지출, 일정 데이터를 월간 정산 기준으로 확인합니다.
        </p>
      </div>

      <div className={styles.metrics} aria-label="월간 운영 지표">
        {metrics.map((metric) => (
          <article className={styles.metricCard} key={metric.label}>
            <p className={styles.metricLabel}>{metric.label}</p>
            <p className={styles.metricValue}>{metric.value}</p>
            <p className={styles.metricNote}>{metric.note}</p>
          </article>
        ))}
      </div>

      <section className={styles.panel} aria-labelledby="work-queue-title">
        <div>
          <p className={styles.panelLabel}>작업 대기</p>
          <h2 id="work-queue-title">오늘 확인할 항목</h2>
        </div>
        <ul className={styles.queue}>
          <li>신규 회원 등록 및 연락처 확인</li>
          <li>7월 회비 입금 내역 대조</li>
          <li>운영비 영수증 입력 준비</li>
        </ul>
      </section>
    </section>
  );
}
