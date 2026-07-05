import styles from "./page.module.scss";
import { createClient } from "@/lib/supabase/server";
import { getNextPeriodMonth, isExpenseCategory } from "@/features/expenses/expense-model";
import {
  buildSettlementSummary,
  formatCurrency,
  formatExpenseCategory,
  formatPeriodMonth,
  formatSettlementBalance,
  normalizeSettlementFilters,
  type SettlementExpenseInput,
  type SettlementFeePaymentInput,
  type SettlementSearchParams,
} from "@/features/settlements/settlement-summary";

type SettlementsPageProps = {
  searchParams: Promise<SettlementSearchParams>;
};

type FeePaymentDatabaseRow = {
  amount: number;
};

type ExpenseDatabaseRow = {
  amount: number;
  category: string;
};

async function getSettlementFeePayments(
  periodMonth: string,
): Promise<SettlementFeePaymentInput[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fee_payments")
    .select("id, amount")
    .eq("period_month", periodMonth)
    .order("amount", { ascending: false });

  if (error) {
    throw new Error("월별 회비 수입을 불러오지 못했습니다.");
  }

  return ((data ?? []) as FeePaymentDatabaseRow[]).map((payment) => ({
    amount: payment.amount,
  }));
}

async function getSettlementExpenses(
  periodMonth: string,
): Promise<SettlementExpenseInput[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .select("id, category, amount")
    .gte("expense_date", periodMonth)
    .lt("expense_date", getNextPeriodMonth(periodMonth))
    .order("amount", { ascending: false });

  if (error) {
    throw new Error("월별 지출을 불러오지 못했습니다.");
  }

  return ((data ?? []) as ExpenseDatabaseRow[]).map((expense) => ({
    amount: expense.amount,
    category: isExpenseCategory(expense.category) ? expense.category : "other",
  }));
}

export default async function SettlementsPage({
  searchParams,
}: SettlementsPageProps) {
  const filters = normalizeSettlementFilters(await searchParams);
  const [feePayments, expenses] = await Promise.all([
    getSettlementFeePayments(filters.periodMonth),
    getSettlementExpenses(filters.periodMonth),
  ]);
  const summary = buildSettlementSummary({ feePayments, expenses });

  return (
    <section className={styles["settlements-page"]}>
      <header className={styles["settlements-header"]}>
        <div>
          <p className={styles["settlements-kicker"]}>월별 정산</p>
          <h1>월별 정산 요약</h1>
        </div>
        <div className={styles["settlements-header-side"]}>
          <p>
            선택한 월의 회비 수입과 운영 지출을 합산해 공유용 월간 보고서의
            기준 금액을 확인합니다.
          </p>
        </div>
      </header>

      <form className={styles["settlements-filters"]}>
        <label>
          정산 월
          <input
            defaultValue={filters.periodMonth.slice(0, 7)}
            name="month"
            type="month"
          />
        </label>
        <button type="submit">조회</button>
      </form>

      <section className={styles["settlements-summary-panel"]}>
        <div className={styles["settlements-summary-heading"]}>
          <p>{formatPeriodMonth(filters.periodMonth)} 정산</p>
          <span>
            회비 납부 {summary.feePaymentCount}건 · 지출 {summary.expenseCount}건
          </span>
        </div>
        <div className={styles["settlements-summary-grid"]}>
          <article>
            <p>수입 합계</p>
            <strong>{formatCurrency(summary.incomeTotal)}원</strong>
          </article>
          <article>
            <p>지출 합계</p>
            <strong>{formatCurrency(summary.expenseTotal)}원</strong>
          </article>
          <article>
            <p>정산 잔액</p>
            <strong>{formatSettlementBalance(summary.balance)}</strong>
          </article>
        </div>
      </section>

      <section
        aria-label="카테고리별 지출"
        className={styles["settlements-category-panel"]}
      >
        <div className={styles["settlements-category-summary"]}>
          <p>카테고리별 지출</p>
        </div>
        {summary.expenseCategoryRows.length > 0 ? (
          <div className={styles["settlements-table-wrap"]}>
            <table className={styles["settlements-table"]}>
              <thead>
                <tr>
                  <th scope="col">카테고리</th>
                  <th scope="col">건수</th>
                  <th scope="col">금액</th>
                </tr>
              </thead>
              <tbody>
                {summary.expenseCategoryRows.map((row) => (
                  <tr key={row.category}>
                    <td>{formatExpenseCategory(row.category)}</td>
                    <td>{row.count}건</td>
                    <td>{formatCurrency(row.amount)}원</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles["settlements-empty-state"]}>
            <h2>카테고리별 지출이 없습니다</h2>
            <p>선택한 월에 등록된 지출이 없습니다.</p>
          </div>
        )}
      </section>
    </section>
  );
}
