import Link from "next/link";
import styles from "./page.module.scss";
import {
  formatPeriodMonth,
  normalizeReportFilters,
  type ReportSearchParams,
} from "@/features/reports/monthly-report";

type ReportsPageProps = {
  searchParams: Promise<ReportSearchParams>;
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const filters = normalizeReportFilters(await searchParams);
  const monthValue = filters.periodMonth.slice(0, 7);

  return (
    <section className={styles["reports-page"]}>
      <header className={styles["reports-header"]}>
        <div>
          <p className={styles["reports-kicker"]}>PDF 보고서</p>
          <h1>월간 PDF 보고서</h1>
        </div>
        <div className={styles["reports-header-side"]}>
          <p>
            선택한 월의 회비 수입과 운영 지출을 회원 공유용 PDF로 생성합니다.
            개별 납부 내역, 미납 회원명, 영수증, 내부 메모는 제외됩니다.
          </p>
        </div>
      </header>

      <form className={styles["reports-filters"]}>
        <label>
          보고서 월
          <input defaultValue={monthValue} name="month" type="month" />
        </label>
        <button type="submit">조회</button>
      </form>

      <section className={styles["reports-download-panel"]}>
        <div>
          <p>{formatPeriodMonth(filters.periodMonth)} 보고서</p>
          <span>현재 등록된 회비와 지출 데이터를 기준으로 생성합니다.</span>
        </div>
        <Link href={`/reports/monthly?month=${monthValue}`}>PDF 다운로드</Link>
      </section>
    </section>
  );
}
