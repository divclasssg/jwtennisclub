import styles from "./page.module.scss";
import { ActionLink, Button, TextInput } from "@/components/atoms";
import {
  EmptyState,
  FilterBar,
  FormField,
  SummaryCard,
  SummaryGrid,
} from "@/components/molecules";
import { DataPanel, DataTable, parseSortState, SortableTableHeader, stableSortRows } from "@/components/organisms";
import { ManagementPageTemplate } from "@/components/templates";
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
import { SettlementCategoryMobileList } from "@/features/settlements/SettlementCategoryMobileList";

type SettlementsPageProps = {
  searchParams: Promise<SettlementSearchParams>;
};

const SETTLEMENT_SORT_KEYS = ["category", "count", "amount"] as const;
type SettlementSortKey = (typeof SETTLEMENT_SORT_KEYS)[number];

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

function settlementSortValue(
  row: ReturnType<typeof buildSettlementSummary>["expenseCategoryRows"][number],
  key: SettlementSortKey,
) {
  switch (key) {
    case "category": return formatExpenseCategory(row.category);
    case "count": return row.count;
    case "amount": return row.amount;
  }
}

export default async function SettlementsPage({
  searchParams,
}: SettlementsPageProps) {
  const params = await searchParams;
  const filters = normalizeSettlementFilters(params);
  const sortState = parseSortState(params, SETTLEMENT_SORT_KEYS, { key: "category", direction: "asc" });
  const monthValue = filters.periodMonth.slice(0, 7);
  const [feePayments, expenses] = await Promise.all([
    getSettlementFeePayments(filters.periodMonth),
    getSettlementExpenses(filters.periodMonth),
  ]);
  const summary = buildSettlementSummary({ feePayments, expenses });
  const sortedCategoryRows = stableSortRows(
    summary.expenseCategoryRows,
    (row) => settlementSortValue(row, sortState.key),
    sortState.direction,
  );
  const sortSearchParams = { month: monthValue };

  return (
    <ManagementPageTemplate
      description={
        <>
          선택한 월의 회비 수입과 운영 지출을 합산해 공유용 월간 보고서의 기준
          금액을 확인합니다.
        </>
      }
      filters={
        <FilterBar aria-label="정산 검색 필터" layout="single-control">
          <FormField label="정산 월">
            <TextInput
              defaultValue={monthValue}
              name="month"
              shape="pill"
              type="month"
            />
          </FormField>
          <Button type="submit">조회</Button>
          <ActionLink href={`/reports/monthly?month=${monthValue}`} size="compact">
            PDF 다운로드
          </ActionLink>
        </FilterBar>
      }
      kicker="월별 정산 요약"
      list={
        <DataPanel
          aria-label="카테고리별 지출"
          empty={
            <EmptyState
              description="선택한 월에 등록된 지출이 없습니다."
              title="카테고리별 지출이 없습니다"
            />
          }
          headerTitle="카테고리별 지출"
        >
          {sortedCategoryRows.length > 0 ? (
            <>
            <div className={styles["settlements-table-view"]}>
              <DataTable>
              <thead>
                <tr>
                  <SortableTableHeader label="카테고리" pathname="/settlements" searchParams={sortSearchParams} sortKey="category" sortState={sortState} />
                  <SortableTableHeader label="건수" pathname="/settlements" searchParams={sortSearchParams} sortKey="count" sortState={sortState} />
                  <SortableTableHeader label="금액" pathname="/settlements" searchParams={sortSearchParams} sortKey="amount" sortState={sortState} />
                </tr>
              </thead>
              <tbody>
                {sortedCategoryRows.map((row) => (
                  <tr key={row.category}>
                    <td>{formatExpenseCategory(row.category)}</td>
                    <td>{row.count}건</td>
                    <td>{formatCurrency(row.amount)}원</td>
                  </tr>
                ))}
              </tbody>
              </DataTable>
            </div>
            <div className={styles["settlements-mobile-list-view"]}>
              <SettlementCategoryMobileList rows={sortedCategoryRows} />
            </div>
            </>
          ) : null}
        </DataPanel>
      }
      summary={
        <DataPanel
          aria-label={`${formatPeriodMonth(filters.periodMonth)} 정산`}
          headerTitle={`${formatPeriodMonth(filters.periodMonth)} 정산`}
        >
          <SummaryGrid aria-label="정산 요약" columns={5} variant="divided">
            <SummaryCard
              label="회비 납부"
              value={`${summary.feePaymentCount}건`}
            />
            <SummaryCard
              label="지출"
              value={`${summary.expenseCount}건`}
            />
            <SummaryCard
              label="수입 합계"
              value={`${formatCurrency(summary.incomeTotal)}원`}
            />
            <SummaryCard
              label="지출 합계"
              value={`${formatCurrency(summary.expenseTotal)}원`}
            />
            <SummaryCard
              label="정산 잔액"
              value={formatSettlementBalance(summary.balance)}
            />
          </SummaryGrid>
        </DataPanel>
      }
      title="월별 정산"
    />
  );
}
