import { ActionLink, Button, TextInput } from "@/components/atoms";
import {
  EmptyState,
  FilterBar,
  FormField,
  SummaryCard,
  SummaryGrid,
} from "@/components/molecules";
import { DataPanel, DataTable } from "@/components/organisms";
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
  const monthValue = filters.periodMonth.slice(0, 7);
  const [feePayments, expenses] = await Promise.all([
    getSettlementFeePayments(filters.periodMonth),
    getSettlementExpenses(filters.periodMonth),
  ]);
  const summary = buildSettlementSummary({ feePayments, expenses });

  return (
    <ManagementPageTemplate
      action={
        <ActionLink href={`/reports/monthly?month=${monthValue}`}>
          PDF 다운로드
        </ActionLink>
      }
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
        </FilterBar>
      }
      kicker="월별 정산"
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
          {summary.expenseCategoryRows.length > 0 ? (
            <DataTable>
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
            </DataTable>
          ) : null}
        </DataPanel>
      }
      summary={
        <DataPanel
          aria-label={`${formatPeriodMonth(filters.periodMonth)} 정산`}
          headerSide={
            <span>
              회비 납부 {summary.feePaymentCount}건 · 지출{" "}
              {summary.expenseCount}건
            </span>
          }
          headerTitle={`${formatPeriodMonth(filters.periodMonth)} 정산`}
        >
          <SummaryGrid columns={3} variant="divided">
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
      title="월별 정산 요약"
    />
  );
}
