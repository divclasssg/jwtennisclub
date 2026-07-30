import { ActionLink, Button, TextInput } from "@/components/atoms";
import {
  EmptyState,
  FilterBar,
  FormField,
  SummaryCard,
  SummaryGrid,
} from "@/components/molecules";
import {
  DataPanel,
  DataTable,
  parseSortState,
  SortableTableHeader,
  stableSortRows,
} from "@/components/organisms";
import { ManagementPageTemplate } from "@/components/templates";
import { closeMonthlySettlement, reopenMonthlySettlement } from "./actions";
import {
  canDownloadMonthlyReport,
  parseMonthlySettlementPage,
  type MonthlySettlementExpenseCategoryRow,
} from "@/features/settlements/settlement-snapshot";
import {
  formatCurrency,
  formatExpenseCategory,
  formatPeriodMonth,
  formatSettlementBalance,
  normalizeSettlementFilters,
  type SettlementSearchParams,
} from "@/features/settlements/settlement-summary";
import { createClient } from "@/lib/supabase/server";

type SettlementsPageProps = {
  searchParams: Promise<SettlementSearchParams & {
    error?: string | string[];
    status?: string | string[];
  }>;
};

const SETTLEMENT_SORT_KEYS = ["category", "count", "amount"] as const;
type SettlementSortKey = (typeof SETTLEMENT_SORT_KEYS)[number];

async function getMonthlySettlementPage(periodMonth: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_monthly_settlement_page", {
    requested_period_month: periodMonth,
  });

  if (error) {
    throw new Error("월별 정산 정보를 불러오지 못했습니다.");
  }

  return parseMonthlySettlementPage(data);
}

function settlementSortValue(
  row: MonthlySettlementExpenseCategoryRow,
  key: SettlementSortKey,
) {
  switch (key) {
    case "category": return formatExpenseCategory(row.category);
    case "count": return row.count;
    case "amount": return row.amount;
  }
}

function getSettlementMessage(
  params: SettlementSearchParams & {
    error?: string | string[];
    status?: string | string[];
  },
): { text: string; tone: "error" | "success" } | null {
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const status = Array.isArray(params.status) ? params.status[0] : params.status;

  if (error === "invalid-month") {
    return { text: "정산 월 형식이 올바르지 않습니다.", tone: "error" };
  }
  if (error === "mutation-failed") {
    return { text: "정산 상태를 변경하지 못했습니다. 다시 시도해 주세요.", tone: "error" };
  }
  if (status === "updated") {
    return { text: "정산 상태를 변경했습니다.", tone: "success" };
  }

  return null;
}

function formatClosedDate(value: string) {
  return value.slice(0, 10).replaceAll("-", ".");
}

export default async function SettlementsPage({
  searchParams,
}: SettlementsPageProps) {
  const params = await searchParams;
  const filters = normalizeSettlementFilters(params);
  const sortState = parseSortState(params, SETTLEMENT_SORT_KEYS, {
    key: "category",
    direction: "asc",
  });
  const monthValue = filters.periodMonth.slice(0, 7);
  const settlementPage = await getMonthlySettlementPage(filters.periodMonth);
  const snapshot = settlementPage.activeClosing?.snapshot ?? settlementPage.preview;
  const sortedCategoryRows = stableSortRows(
    snapshot.expenseCategoryRows,
    (row) => settlementSortValue(row, sortState.key),
    sortState.direction,
  );
  const sortSearchParams = { month: monthValue };
  const feedback = getSettlementMessage(params);
  const canDownload = Boolean(settlementPage.activeClosing) &&
    canDownloadMonthlyReport(filters.periodMonth, new Date());

  const mutationControls = settlementPage.canClose || settlementPage.canReopen ? (
    <>
      {settlementPage.canClose ? (
        <form action={closeMonthlySettlement}>
          <input name="month" type="hidden" value={monthValue} />
          <input name="sort" type="hidden" value={sortState.key} />
          <input name="direction" type="hidden" value={sortState.direction} />
          <Button size="compact" type="submit">정산 마감</Button>
        </form>
      ) : null}
      {settlementPage.canReopen ? (
        <form action={reopenMonthlySettlement}>
          <input name="month" type="hidden" value={monthValue} />
          <input name="sort" type="hidden" value={sortState.key} />
          <input name="direction" type="hidden" value={sortState.direction} />
          <Button size="compact" type="submit" variant="danger">정산 재개</Button>
        </form>
      ) : null}
    </>
  ) : null;

  return (
    <ManagementPageTemplate
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
          {canDownload ? (
            <ActionLink href={`/reports/monthly?month=${monthValue}`} size="compact">
              PDF 다운로드
            </ActionLink>
          ) : null}
          {feedback ? (
            <p aria-live="polite" role="status">
              {feedback.text}
            </p>
          ) : null}
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
          ) : null}
        </DataPanel>
      }
      summary={
        <DataPanel
          aria-label={`${formatPeriodMonth(filters.periodMonth)} 정산`}
          headerSide={mutationControls}
          headerTitle={`${formatPeriodMonth(filters.periodMonth)} 정산`}
        >
          <SummaryGrid aria-label="정산 요약" columns={5} variant="divided">
            <SummaryCard label="월말 활동 회원" value={`${snapshot.activityMemberCount}명`} />
            <SummaryCard label="회비 부과 대상" value={`${snapshot.feeTargetCount}명`} />
            <SummaryCard label="완납 회원" value={`${snapshot.fullyPaidCount}명`} />
            <SummaryCard label="미납 회원" value={`${snapshot.unpaidCount}명`} />
            <SummaryCard label="운영 지출 건수" value={`${snapshot.expenseCount}건`} />
            <SummaryCard label="총 청구액" value={`${formatCurrency(snapshot.billedTotal)}원`} />
            <SummaryCard label="실제 회비 수납액" value={`${formatCurrency(snapshot.actualFeeIncome)}원`} />
            <SummaryCard label="인정 납부액" value={`${formatCurrency(snapshot.recognizedPaidTotal)}원`} />
            <SummaryCard label="조정 수납액" value={`${formatCurrency(snapshot.adjustmentIncome)}원`} />
            <SummaryCard label="미납액" value={`${formatCurrency(snapshot.unpaidTotal)}원`} />
            <SummaryCard label="운영 지출" value={`${formatCurrency(snapshot.expenseTotal)}원`} />
            <SummaryCard label="당월 귀속 수지" value={formatSettlementBalance(snapshot.attributedNet)} />
            <SummaryCard label="기초 장부 잔액" value={formatSettlementBalance(snapshot.openingLedgerBalance)} />
            <SummaryCard label="기말 장부 잔액" value={formatSettlementBalance(snapshot.closingLedgerBalance)} />
            {settlementPage.activeClosing ? (
              <>
                <SummaryCard label="마감 버전" value={`v${settlementPage.activeClosing.version}`} />
                <SummaryCard label="마감일" value={formatClosedDate(settlementPage.activeClosing.closedAt)} />
                <SummaryCard label="마감 처리자" value={settlementPage.activeClosing.closedBy} />
              </>
            ) : null}
          </SummaryGrid>
          {snapshot.feeTargetCount === 0 ? (
            <p>해당 월 회비 부과 대상 회원이 없습니다.</p>
          ) : null}
          {!settlementPage.activeClosing && settlementPage.closeBlockedReason ? (
            <p>현재 이 정산은 마감할 수 없습니다.</p>
          ) : null}
        </DataPanel>
      }
      title="월별 정산"
    />
  );
}
