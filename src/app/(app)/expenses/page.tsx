import { deleteExpense } from "./actions";
import { ActionLink, Button, SelectInput, TextInput } from "@/components/atoms";
import {
  EmptyState,
  FilterBar,
  FormField,
  RowActions,
  SummaryCard,
  SummaryGrid,
} from "@/components/molecules";
import { DataPanel, DataTable, parseSortState, SortableTableHeader, stableSortRows } from "@/components/organisms";
import { ManagementPageTemplate } from "@/components/templates";
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
import { getMonthlySourceLockStatus } from "@/features/settlements/monthly-source-lock";

type ExpensesPageProps = {
  searchParams: Promise<ExpenseListSearchParams>;
};

const EXPENSE_SORT_KEYS = ["expenseDate", "category", "description", "amount", "memo"] as const;
type ExpenseSortKey = (typeof EXPENSE_SORT_KEYS)[number];

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

function expenseSortValue(
  expense: Awaited<ReturnType<typeof getExpenses>>[number],
  key: ExpenseSortKey,
) {
  switch (key) {
    case "expenseDate": return expense.expenseDate;
    case "category": return formatExpenseCategory(expense.category);
    case "description": return expense.description;
    case "amount": return expense.amount;
    case "memo": return expense.memo;
  }
}

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  const params = await searchParams;
  const filters = normalizeExpenseListFilters(params);
  const sortState = parseSortState(params, EXPENSE_SORT_KEYS, { key: "expenseDate", direction: "desc" });
  const [expenses, isLocked] = await Promise.all([
    getExpenses(filters),
    getMonthlySourceLockStatus(filters.periodMonth),
  ]);
  const sortedExpenses = stableSortRows(expenses, (expense) => expenseSortValue(expense, sortState.key), sortState.direction);
  const sortSearchParams = {
    month: filters.periodMonth.slice(0, 7),
    category: filters.category,
  };
  const summary = buildExpenseListSummary(expenses);
  const hasFilters = filters.category !== "all";

  return (
    <ManagementPageTemplate
      description="월별 운영 지출을 등록하고 카테고리별로 확인합니다."
      filters={
        <FilterBar aria-label="지출 검색 필터" layout="two-controls">
          <FormField label="사용 월">
            <TextInput
              defaultValue={filters.periodMonth.slice(0, 7)}
              name="month"
              shape="pill"
              type="month"
            />
          </FormField>
          <FormField label="카테고리">
            <SelectInput defaultValue={filters.category} name="category" shape="pill">
              <option value="all">전체</option>
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {formatCategoryFilterLabel(category)}
                </option>
              ))}
            </SelectInput>
          </FormField>
          <Button type="submit">조회</Button>
        </FilterBar>
      }
      kicker="월별 지출 현황"
      list={
        <>
          {isLocked ? (
            <p role="status">
              최종 마감된 월입니다. 회비와 지출을 수정하려면 먼저 결산을
              재개하세요.
            </p>
          ) : null}
          <DataPanel
          aria-label="월별 지출 목록"
          empty={
            <EmptyState
              description="사용 월이나 카테고리 필터를 조정해서 지출 기록을 확인하세요."
              title="등록된 지출이 없습니다"
            />
          }
          headerSide={
            <>
              {hasFilters ? <a href="/expenses">필터 초기화</a> : null}
              {isLocked ? null : (
                <ActionLink
                  href={`/expenses/new?month=${filters.periodMonth.slice(0, 7)}`}
                  size="compact"
                >
                  지출 등록
                </ActionLink>
              )}
            </>
          }
          headerTitle={`${formatPeriodMonth(filters.periodMonth)} · 총 ${sortedExpenses.length}건`}
          >
            {sortedExpenses.length > 0 ? (
            <DataTable>
              <thead>
                <tr>
                  <SortableTableHeader label="사용일" pathname="/expenses" searchParams={sortSearchParams} sortKey="expenseDate" sortState={sortState} />
                  <SortableTableHeader label="카테고리" pathname="/expenses" searchParams={sortSearchParams} sortKey="category" sortState={sortState} />
                  <SortableTableHeader label="내용" pathname="/expenses" searchParams={sortSearchParams} sortKey="description" sortState={sortState} />
                  <SortableTableHeader label="금액" pathname="/expenses" searchParams={sortSearchParams} sortKey="amount" sortState={sortState} />
                  <th scope="col">증빙</th>
                  <SortableTableHeader label="메모" pathname="/expenses" searchParams={sortSearchParams} sortKey="memo" sortState={sortState} />
                  <th scope="col">관리</th>
                </tr>
              </thead>
              <tbody>
                {sortedExpenses.map((expense) => (
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
                      {isLocked ? (
                        "-"
                      ) : (
                        <RowActions>
                          <ActionLink
                            href={`/expenses/${expense.id}/edit`}
                            size="compact"
                            variant="secondary"
                          >
                            수정
                          </ActionLink>
                          <form action={deleteExpense}>
                            <input name="expenseId" type="hidden" value={expense.id} />
                            <Button size="compact" type="submit" variant="danger">
                              삭제
                            </Button>
                          </form>
                        </RowActions>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            ) : null}
          </DataPanel>
        </>
      }
      summary={
        <SummaryGrid aria-label="지출 요약" columns={2}>
          <SummaryCard label="지출 건수" value={`${summary.count}건`} />
          <SummaryCard
            label="지출 합계"
            value={`${formatCurrency(summary.totalAmount)}원`}
          />
        </SummaryGrid>
      }
      title="지출 관리"
    />
  );
}
