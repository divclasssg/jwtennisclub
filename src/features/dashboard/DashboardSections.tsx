import Link from "next/link";

import styles from "@/app/(app)/dashboard/page.module.scss";

import type {
  DashboardCurrentFinance,
  DashboardFinalClosingSummary,
  DashboardPageData,
} from "./dashboard-page";

const currencyFormatter = new Intl.NumberFormat("ko-KR");
const seoulTimestampFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const seoulDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const blockedFinanceMessages: Record<
  Extract<DashboardCurrentFinance, { status: "blocked" }>["blockedReason"],
  string
> = {
  "member-activity-start-required":
    "활동 시작 월이 확인되지 않은 회원이 있어 재무를 계산할 수 없습니다.",
  "prior-final-closing-required":
    "직전 월 최종 마감이 필요해 재무를 계산할 수 없습니다.",
  "invalid-public-expense-description":
    "공개 지출 설명을 확인해야 재무를 계산할 수 없습니다.",
};

export function DashboardOverview({ data }: { data: DashboardPageData }) {
  const blockedMessage =
    data.currentFinance.status === "blocked"
      ? blockedFinanceMessages[data.currentFinance.blockedReason]
      : null;
  const isProvisional =
    data.currentFinance.status === "available" &&
    data.currentFinance.source === "current";

  return (
    <section
      className={styles["dashboard-section"]}
      aria-labelledby="club-overview-title"
    >
      <h2 className={styles["dashboard-section-title"]} id="club-overview-title">
        클럽 요약
      </h2>
      <div className={styles["dashboard-overview-grid"]}>
        <article className={styles["dashboard-member-card"]}>
          <p className={styles["dashboard-card-label"]}>활동 회원</p>
          <p className={styles["dashboard-member-count"]}>
            {data.members.activeCount}명
          </p>
          <p className={styles["dashboard-supporting-copy"]}>
            활동 예정 {data.members.upcomingCount} · 휴회 {data.members.pausedCount}
          </p>
          <p className={styles["dashboard-supporting-copy"]}>
            이번 달 신규 {data.members.joinedThisMonthCount} · 휴회{" "}
            {data.members.pausedThisMonthCount} · 탈퇴{" "}
            {data.members.withdrawnThisMonthCount}
          </p>
        </article>

        <article className={styles["dashboard-balance-card"]}>
          <div>
            <p className={styles["dashboard-card-label"]}>현재 장부 잔액</p>
            <p className={styles["dashboard-balance-value"]}>
              {data.currentFinance.status === "available"
                ? formatCurrency(data.currentFinance.summary.closingLedgerBalance)
                : "계산 대기"}
            </p>
            <p className={styles["dashboard-balance-meta"]}>
              {formatSeoulTimestamp(data.asOf)} 기준
            </p>
          </div>
          {isProvisional ? (
            <p className={styles["dashboard-provisional-label"]}>
              최종 마감 전 변동 가능
            </p>
          ) : null}
          {blockedMessage ? (
            <p className={styles["dashboard-blocked-copy"]}>{blockedMessage}</p>
          ) : null}
        </article>
      </div>
    </section>
  );
}

export function CurrentMonthFinance({
  finance,
  periodMonth,
}: {
  finance: DashboardCurrentFinance;
  periodMonth: string;
}) {
  const month = periodMonth.slice(0, 7);

  return (
    <section
      className={styles["dashboard-current-finance"]}
      aria-label="이번 달 재무 현황"
    >
      <header className={styles["dashboard-panel-header"]}>
        <h2 id="current-finance-title">
          {formatPeriodMonth(periodMonth)} 재무 현황
        </h2>
        <Link href={`/settlements?month=${month}`}>월별 결산 보기</Link>
      </header>

      {finance.status === "blocked" ? (
        <div className={styles["dashboard-blocked-panel"]}>
          <strong>계산 대기</strong>
          <p>{blockedFinanceMessages[finance.blockedReason]}</p>
        </div>
      ) : (
        <dl className={styles["dashboard-finance-metrics"]}>
          <FinanceMetric
            label="총 청구액"
            value={formatCurrency(finance.summary.billedTotal)}
          />
          <FinanceMetric
            label="실제 회비 수납액"
            value={formatCurrency(finance.summary.actualFeeIncome)}
          />
          <FinanceMetric
            label="운영 지출"
            value={formatCurrency(finance.summary.expenseTotal)}
          />
          <FinanceMetric
            label="당월 귀속 수지"
            value={formatSignedCurrency(finance.summary.attributedNet)}
            emphasized
          />
          <FinanceMetric
            label="납부 현황"
            value={`완납 ${finance.summary.fullyPaidCount} / ${finance.summary.feeTargetCount}명`}
          />
          <FinanceMetric
            label="미납 회원"
            value={`${finance.summary.unpaidCount}명`}
          />
          <FinanceMetric
            label="미납액"
            value={formatCurrency(finance.summary.unpaidTotal)}
          />
          <FinanceMetric label="결산 상태" value={getClosingStatus(finance)} />
        </dl>
      )}
    </section>
  );
}

export function LatestFinalClosing({
  closing,
}: {
  closing: DashboardFinalClosingSummary | null;
}) {
  return (
    <section
      className={styles["dashboard-section"]}
      aria-labelledby="latest-final-title"
    >
      <h2 className={styles["dashboard-section-title"]} id="latest-final-title">
        최근 최종 마감
      </h2>
      {closing ? (
        <div className={styles["dashboard-closing-card"]}>
          <header className={styles["dashboard-closing-title"]}>
            <span>{formatPeriodMonth(closing.periodMonth)}</span>
            <strong>최종 마감 v{closing.version}</strong>
            <span>{formatSeoulDate(closing.closedAt)} 마감</span>
          </header>
          <dl className={styles["dashboard-closing-metrics"]}>
            <FinanceMetric
              label="기초 잔액"
              value={formatCurrency(closing.openingLedgerBalance)}
            />
            <FinanceMetric
              label="실제 수납"
              value={formatCurrency(closing.actualFeeIncome)}
            />
            <FinanceMetric
              label="운영 지출"
              value={formatCurrency(closing.expenseTotal)}
            />
            <FinanceMetric
              label="당월 수지"
              value={formatSignedCurrency(closing.attributedNet)}
              emphasized
            />
            <FinanceMetric
              label="기말 잔액"
              value={formatCurrency(closing.closingLedgerBalance)}
            />
          </dl>
          <div className={styles["dashboard-closing-actions"]}>
            <Link href={`/settlements?month=${closing.periodMonth.slice(0, 7)}`}>
              결산 보기
            </Link>
            <Link href={`/reports/monthly?snapshot=${closing.id}`}>PDF 보기</Link>
          </div>
        </div>
      ) : (
        <p className={styles["dashboard-empty-state"]}>
          아직 최종 마감된 결산이 없습니다
        </p>
      )}
    </section>
  );
}

function FinanceMetric({
  emphasized = false,
  label,
  value,
}: {
  emphasized?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className={styles["dashboard-finance-metric"]}>
      <dt>{label}</dt>
      <dd
        className={
          emphasized ? styles["dashboard-emphasized-value"] : undefined
        }
      >
        {value}
      </dd>
    </div>
  );
}

function getClosingStatus(
  finance: Extract<DashboardCurrentFinance, { status: "available" }>,
) {
  if (finance.activeFinal) {
    return `최종 마감 v${finance.activeFinal.version}`;
  }

  if (finance.latestInterim) {
    return `중간 결산 v${finance.latestInterim.version} 이후 변동 가능`;
  }

  return "미결산";
}

function formatCurrency(value: number): string {
  return `${currencyFormatter.format(value)}원`;
}

function formatSignedCurrency(value: number): string {
  return `${value > 0 ? "+" : ""}${currencyFormatter.format(value)}원`;
}

function formatPeriodMonth(periodMonth: string): string {
  return `${periodMonth.slice(0, 4)}년 ${Number(periodMonth.slice(5, 7))}월`;
}

function formatSeoulTimestamp(value: string): string {
  const parts = seoulTimestampFormatter.formatToParts(new Date(value));

  return `${getDatePart(parts, "year")}.${getDatePart(parts, "month")}.${getDatePart(parts, "day")} ${getDatePart(parts, "hour")}:${getDatePart(parts, "minute")}`;
}

function formatSeoulDate(value: string): string {
  const parts = seoulDateFormatter.formatToParts(new Date(value));

  return `${getDatePart(parts, "year")}.${getDatePart(parts, "month")}.${getDatePart(parts, "day")}`;
}

function getDatePart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
) {
  return parts.find((part) => part.type === type)?.value ?? "";
}
