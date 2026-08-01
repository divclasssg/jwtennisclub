import {
  LedgerBalanceChart,
  MonthlyCashFlowChart,
} from "@/features/dashboard/FinancialCharts";
import {
  CurrentMonthFinance,
  DashboardOverview,
  LatestFinalClosing,
} from "@/features/dashboard/DashboardSections";
import { loadDashboardPage } from "@/features/dashboard/dashboard-data";
import { PageTitle } from "@/features/shell/PageTitleContext";

import styles from "./page.module.scss";

export default async function DashboardPage() {
  const dashboard = await loadDashboardPage();

  return (
    <section className={styles["dashboard-page"]}>
      <PageTitle title="홈" />
      <DashboardOverview data={dashboard} />
      <CurrentMonthFinance
        finance={dashboard.currentFinance}
        periodMonth={dashboard.periodMonth}
      />
      <section
        className={styles["dashboard-section"]}
        aria-labelledby="finance-trends-title"
      >
        <h2
          className={styles["dashboard-section-title"]}
          id="finance-trends-title"
        >
          재무 추이
        </h2>
        <div className={styles["dashboard-trends-grid"]}>
          <MonthlyCashFlowChart points={dashboard.trends} />
          <LedgerBalanceChart points={dashboard.trends} />
        </div>
      </section>
      <LatestFinalClosing closing={dashboard.latestFinal} />
    </section>
  );
}
