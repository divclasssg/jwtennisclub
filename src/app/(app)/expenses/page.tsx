import Link from "next/link";
import styles from "./page.module.scss";
import { deleteExpense } from "./actions";
import { createClient } from "@/lib/supabase/server";
import {
  buildExpenseListSummary,
  EXPENSE_CATEGORIES,
  formatCurrency,
  formatExpenseCategory,
  formatPeriodMonth,
  getNextPeriodMonth,
  mapExpenseRow,
  normalizeExpenseListFilters,
  type ExpenseListSearchParams,
} from "@/features/expenses/expense-list";

type ExpensesPageProps = {
  searchParams: Promise<ExpenseListSearchParams>;
};

async function getExpenses(filters: ReturnType<typeof normalizeExpenseListFilters>) {
  const supabase = await createClient();
  let request = supabase
    .from("expenses")
    .select(
      "id, expense_date, category, description, amount, has_receipt, receipt_content_type, receipt_file_key, receipt_file_name, receipt_file_size, memo, created_by, updated_by, created_at, updated_at",
    )
    .gte("expense_date", filters.periodMonth)
    .lt("expense_date", getNextPeriodMonth(filters.periodMonth));

  if (filters.category !== "all") {
    request = request.eq("category", filters.category);
  }

  const { data, error } = await request.order("expense_date", { ascending: false });

  if (error) {
    throw new Error("지출 목록을 불러오지 못했습니다.");
  }

  return (data ?? []).map(mapExpenseRow);
}

function formatCategoryFilterLabel(category: string) {
  if (category === "all") {
    return "전체";
  }

  return formatExpenseCategory(category as never);
}

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  const filters = normalizeExpenseListFilters(await searchParams);
  const expenses = await getExpenses(filters);
  const summary = buildExpenseListSummary(expenses);
  const hasFilters = filters.category !== "all";

  return (
    <section className={styles["expenses-page"]}>
      <header className={styles["expenses-header"]}>
        <div>
          <p className={styles["expenses-kicker"]}>지출 관리</p>
          <h1>월별 지출 현황</h1>
        </div>
        <div className={styles["expenses-header-side"]}>
          <p>월별 운영 지출을 등록하고 카테고리별로 확인합니다.</p>
          <Link href="/expenses/new">지출 등록</Link>
        </div>
      </header>

      <section className={styles["expenses-summary-grid"]} aria-label="지출 요약">
        <article>
          <p>지출 건수</p>
          <strong>{summary.count}건</strong>
        </article>
        <article>
          <p>지출 합계</p>
          <strong>{formatCurrency(summary.totalAmount)}원</strong>
        </article>
      </section>

      <form className={styles["expenses-filters"]}>
        <label>
          사용 월
          <input
            defaultValue={filters.periodMonth.slice(0, 7)}
            name="month"
            type="month"
          />
        </label>
        <label>
          카테고리
          <select defaultValue={filters.category} name="category">
            <option value="all">전체</option>
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {formatCategoryFilterLabel(category)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">조회</button>
      </form>

      <section aria-label="월별 지출 목록" className={styles["expenses-list-panel"]}>
        <div className={styles["expenses-list-summary"]}>
          <p>
            {formatPeriodMonth(filters.periodMonth)} · 총 {expenses.length}건
          </p>
          {hasFilters ? <a href="/expenses">필터 초기화</a> : null}
        </div>

        {expenses.length > 0 ? (
          <div className={styles["expenses-table-wrap"]}>
            <table className={styles["expenses-table"]}>
              <thead>
                <tr>
                  <th scope="col">사용일</th>
                  <th scope="col">카테고리</th>
                  <th scope="col">내용</th>
                  <th scope="col">금액</th>
                  <th scope="col">증빙</th>
                  <th scope="col">메모</th>
                  <th scope="col">관리</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td>{expense.expenseDate.replaceAll("-", ".")}</td>
                    <td>{formatExpenseCategory(expense.category)}</td>
                    <td>{expense.description}</td>
                    <td>{formatCurrency(expense.amount)}원</td>
                    <td>
                      {expense.receiptFileKey ? (
                        <a
                          href={`/expenses/receipts?key=${encodeURIComponent(expense.receiptFileKey)}`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          영수증 보기
                        </a>
                      ) : expense.hasReceipt ? (
                        "증빙 있음"
                      ) : (
                        "증빙 없음"
                      )}
                    </td>
                    <td>{expense.memo ?? "-"}</td>
                    <td>
                      <div className={styles["expense-row-actions"]}>
                        <Link href={`/expenses/${expense.id}/edit`}>수정</Link>
                        <form action={deleteExpense}>
                          <input name="expenseId" type="hidden" value={expense.id} />
                          <button
                            className={styles["expense-delete-button"]}
                            type="submit"
                          >
                            삭제
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles["expenses-empty-state"]}>
            <h2>등록된 지출이 없습니다</h2>
            <p>사용 월이나 카테고리 필터를 조정해서 지출 기록을 확인하세요.</p>
          </div>
        )}
      </section>
    </section>
  );
}
