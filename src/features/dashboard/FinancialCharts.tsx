import type { DashboardTrendPoint } from "./dashboard-page";
import styles from "./FinancialCharts.module.scss";

const CHART_WIDTH = 560;
const CHART_HEIGHT = 240;
const PLOT_LEFT = 48;
const PLOT_RIGHT = 536;
const PLOT_TOP = 32;
const PLOT_BOTTOM = 208;
const MONTH_LABEL_Y = 228;

const currencyFormatter = new Intl.NumberFormat("ko-KR");

export function createLinearScale(
  values: number[],
  rangeStart: number,
  rangeEnd: number,
): (value: number) => number {
  const finiteValues = values.filter(Number.isFinite);

  if (finiteValues.length === 0) {
    return () => rangeEnd;
  }

  let domainStart = Math.min(...finiteValues);
  let domainEnd = Math.max(...finiteValues);

  if (domainStart === 0 && domainEnd === 0) {
    domainEnd = 1;
  } else if (domainStart === domainEnd) {
    const padding = Math.max(Math.abs(domainStart) * 0.1, 1);
    domainStart -= padding;
    domainEnd += padding;
  }

  const domainSize = domainEnd - domainStart;

  return (value) =>
    rangeEnd - ((value - domainStart) / domainSize) * (rangeEnd - rangeStart);
}

export function formatChartMonth(periodMonth: string): string {
  return `${Number(periodMonth.slice(5, 7))}월`;
}

export function MonthlyCashFlowChart({
  points,
}: {
  points: DashboardTrendPoint[];
}) {
  if (points.length === 0) {
    return (
      <ChartFrame heading="월별 수납·지출">
        <p className={styles["chart-empty-state"]}>표시할 재무 흐름이 없습니다.</p>
      </ChartFrame>
    );
  }

  const scale = createLinearScale(
    [0, ...points.flatMap((point) => [point.actualFeeIncome, point.expenseTotal])],
    PLOT_TOP,
    PLOT_BOTTOM,
  );
  const baseline = scale(0);
  const groupWidth = (PLOT_RIGHT - PLOT_LEFT) / points.length;
  const barWidth = Math.min(24, groupWidth * 0.28);

  return (
    <ChartFrame heading="월별 수납·지출">
      <ul className={styles["chart-legend"]} aria-label="범례">
        <li>
          <span className={styles["income-legend-key"]} aria-hidden="true" />
          실제 회비 수납액
        </li>
        <li>
          <span className={styles["expense-legend-key"]} aria-hidden="true" />
          운영 지출
        </li>
      </ul>
      <svg
        className={styles["chart-svg"]}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-labelledby="cash-flow-chart-title"
        aria-describedby="cash-flow-chart-description"
        focusable="false"
      >
        <title id="cash-flow-chart-title">월별 실제 회비 수납액과 운영 지출</title>
        <desc id="cash-flow-chart-description">
          최근 6개월의 실제 회비 수납액과 운영 지출을 월별 그룹 막대로 비교합니다.
        </desc>
        <line
          className={styles["chart-axis"]}
          x1={PLOT_LEFT}
          x2={PLOT_RIGHT}
          y1={baseline}
          y2={baseline}
        />
        {points.map((point, index) => {
          const centerX = PLOT_LEFT + groupWidth * (index + 0.5);
          const incomeY = scale(point.actualFeeIncome);
          const expenseY = scale(point.expenseTotal);

          return (
            <g key={point.periodMonth}>
              <rect
                className={styles["income-bar"]}
                x={centerX - barWidth}
                y={incomeY}
                width={barWidth}
                height={Math.max(0, baseline - incomeY)}
              />
              <rect
                className={styles["expense-bar"]}
                x={centerX}
                y={expenseY}
                width={barWidth}
                height={Math.max(0, baseline - expenseY)}
              />
              <text
                className={styles["chart-month-label"]}
                x={centerX}
                y={MONTH_LABEL_Y}
              >
                {formatChartMonth(point.periodMonth)}
              </text>
            </g>
          );
        })}
      </svg>
      <table className={styles["visually-hidden"]} aria-label="월별 수납 및 지출 수치">
        <thead>
          <tr>
            <th scope="col">월</th>
            <th scope="col">실제 회비 수납액</th>
            <th scope="col">운영 지출</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.periodMonth}>
              <th scope="row">{formatChartMonth(point.periodMonth)}</th>
              <td>{formatCurrency(point.actualFeeIncome)}</td>
              <td>{formatCurrency(point.expenseTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ChartFrame>
  );
}

export function LedgerBalanceChart({
  points,
}: {
  points: DashboardTrendPoint[];
}) {
  if (points.length === 0) {
    return (
      <ChartFrame heading="장부 잔액 추이">
        <p className={styles["chart-empty-state"]}>
          표시할 장부 잔액 추이가 없습니다.
        </p>
      </ChartFrame>
    );
  }

  const scale = createLinearScale(
    points.map((point) => point.closingLedgerBalance),
    PLOT_TOP,
    PLOT_BOTTOM,
  );
  const coordinates = points.map((point, index) => ({
    point,
    x:
      points.length === 1
        ? (PLOT_LEFT + PLOT_RIGHT) / 2
        : PLOT_LEFT + ((PLOT_RIGHT - PLOT_LEFT) * index) / (points.length - 1),
    y: scale(point.closingLedgerBalance),
  }));
  const hasFinalPoint = points.some((point) => point.source === "final");
  const hasCurrentPoint = points.at(-1)?.source === "current";

  return (
    <ChartFrame heading="장부 잔액 추이">
      <ul className={styles["chart-legend"]} aria-label="범례">
        {hasFinalPoint ? (
          <li>
            <span className={styles["final-legend-key"]} aria-hidden="true" />
            확정 잔액
          </li>
        ) : null}
        {hasCurrentPoint ? (
          <li>
            <span className={styles["provisional-legend-key"]} aria-hidden="true" />
            현재 예상 잔액 <span className={styles["chart-status"]}>변동 가능</span>
          </li>
        ) : null}
      </ul>
      <svg
        className={styles["chart-svg"]}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-labelledby="ledger-balance-chart-title"
        aria-describedby="ledger-balance-chart-description"
        focusable="false"
      >
        <title id="ledger-balance-chart-title">월별 장부 잔액 추이</title>
        <desc id="ledger-balance-chart-description">
          최근 6개월의 확정 장부 잔액과 변동 가능한 현재 예상 잔액을 보여줍니다.
        </desc>
        {coordinates.slice(1).map((coordinate, index) => {
          const previous = coordinates[index];

          if (!areConsecutiveMonths(previous.point.periodMonth, coordinate.point.periodMonth)) {
            return null;
          }

          const isProvisional = coordinate.point.source === "current";

          return (
            <line
              className={
                isProvisional
                  ? styles["provisional-balance-segment"]
                  : styles["final-balance-segment"]
              }
              data-balance-segment
              key={`${previous.point.periodMonth}-${coordinate.point.periodMonth}`}
              x1={previous.x}
              x2={coordinate.x}
              y1={previous.y}
              y2={coordinate.y}
              strokeDasharray={isProvisional ? "6 6" : undefined}
            />
          );
        })}
        {coordinates.map(({ point, x, y }) => (
          <g key={point.periodMonth}>
            <circle
              className={
                point.source === "current"
                  ? styles["provisional-balance-marker"]
                  : styles["final-balance-marker"]
              }
              data-balance-marker
              data-source={point.source}
              cx={x}
              cy={y}
              r={5}
              fill={point.source === "current" ? "var(--canvas)" : undefined}
            />
            <text
              className={styles["chart-month-label"]}
              x={x}
              y={MONTH_LABEL_Y}
            >
              {formatChartMonth(point.periodMonth)}
            </text>
          </g>
        ))}
      </svg>
      <table className={styles["visually-hidden"]} aria-label="월별 장부 잔액 수치">
        <thead>
          <tr>
            <th scope="col">월</th>
            <th scope="col">구분</th>
            <th scope="col">장부 잔액</th>
            <th scope="col">상태</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.periodMonth}>
              <th scope="row">{formatChartMonth(point.periodMonth)}</th>
              <td>{point.source === "current" ? "현재 예상 잔액" : "확정 잔액"}</td>
              <td>{formatCurrency(point.closingLedgerBalance)}</td>
              <td>{point.source === "current" ? "변동 가능" : "확정"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ChartFrame>
  );
}

function ChartFrame({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles["chart-card"]}>
      <header className={styles["chart-header"]}>
        <h3>{heading}</h3>
        <span>최근 6개월</span>
      </header>
      {children}
    </section>
  );
}

function formatCurrency(value: number): string {
  return `${currencyFormatter.format(value)}원`;
}

function areConsecutiveMonths(previous: string, next: string): boolean {
  const previousSerial = monthSerial(previous);
  const nextSerial = monthSerial(next);

  return nextSerial - previousSerial === 1;
}

function monthSerial(periodMonth: string): number {
  const year = Number(periodMonth.slice(0, 4));
  const month = Number(periodMonth.slice(5, 7));

  return year * 12 + month;
}
