import styles from "./page.module.scss";

const metrics = [
  { label: "회비 수입", value: "0원", note: "이번 달 입금 합계" },
  { label: "운영비 지출", value: "0원", note: "코트비, 공, 기타 비용" },
  { label: "미납 회원", value: "0명", note: "확인 대기" },
  { label: "정산 상태", value: "진행 중", note: "월말 확정 전" },
];

const utilityItems = [
  {
    label: "회원",
    title: "연락처와 출석 흐름을 한 화면에서 확인",
    href: "/members",
  },
  {
    label: "정산",
    title: "월말 회비, 운영비, 잔액을 빠르게 대조",
    href: "/settlements",
  },
  {
    label: "PDF",
    title: "공유용 월간 리포트를 준비",
    href: "/reports",
  },
];

export default function DashboardPage() {
  return (
    <section className={styles["dashboard-page"]}>
      <section aria-label="월간 운영 지표">
        <dl className={styles["dashboard-metrics"]}>
          {metrics.map((metric) => (
            <div className={styles["dashboard-metric-card"]} key={metric.label}>
              <dt className={styles["dashboard-metric-label"]}>
                {metric.label}
              </dt>
              <dd className={styles["dashboard-metric-value"]}>
                {metric.value}
              </dd>
              <dd className={styles["dashboard-metric-note"]}>
                {metric.note}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles["dashboard-utility-grid"]}>
        {utilityItems.map((item) => (
          <a
            className={styles["dashboard-utility-card"]}
            href={item.href}
            key={item.href}
          >
            <span>{item.label}</span>
            <strong>{item.title}</strong>
          </a>
        ))}
      </section>

      <section
        className={styles["dashboard-panel"]}
        aria-labelledby="work-queue-title"
      >
        <div>
          <p className={styles["dashboard-panel-label"]}>작업 대기</p>
          <h2 id="work-queue-title">오늘 확인할 항목</h2>
        </div>
        <ul className={styles["dashboard-queue"]}>
          <li>신규 회원 등록 및 연락처 확인</li>
          <li>7월 회비 입금 내역 대조</li>
          <li>운영비 영수증 입력 준비</li>
        </ul>
      </section>
    </section>
  );
}
