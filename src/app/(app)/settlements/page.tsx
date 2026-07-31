import styles from "./page.module.scss";
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
import {
  parseMonthlySettlementPage,
  type MonthlySettlementClosing,
  type MonthlySettlementClosingKind,
  type MonthlySettlementExpenseCategoryRow,
} from "@/features/settlements/settlement-snapshot";
import {
  formatCurrency,
  formatExpenseCategory,
  formatPeriodMonth,
  formatSeoulProcessedDateTime,
  formatSettlementBalance,
  normalizeSettlementFilters,
  type SettlementSearchParams,
} from "@/features/settlements/settlement-summary";
import { createClient } from "@/lib/supabase/server";
import { SettlementCategoryMobileList } from "@/features/settlements/SettlementCategoryMobileList";
import {
  closeMonthlySettlement,
  createInterimMonthlySettlement,
  reopenMonthlySettlement,
} from "./actions";

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
  const { data, error } = await supabase.rpc("get_monthly_settlement_page_v2", {
    requested_period_month: periodMonth,
  });

  if (error) {
    throw new Error("월별 결산 정보를 불러오지 못했습니다.");
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
    return { text: "결산 월 형식이 올바르지 않습니다.", tone: "error" };
  }
  if (error === "mutation-failed") {
    return {
      text: "결산 상태를 변경하지 못했습니다. 다시 시도해 주세요.",
      tone: "error",
    };
  }
  if (status === "interim-created") {
    return { text: "중간 결산을 생성했습니다.", tone: "success" };
  }
  if (status === "final-closed") {
    return { text: "최종 마감을 완료했습니다.", tone: "success" };
  }
  if (status === "final-reopened") {
    return { text: "결산을 재개했습니다.", tone: "success" };
  }

  return null;
}

function formatClosingStatus(closing: MonthlySettlementClosing) {
  if (closing.status === "reopened") {
    return "재개됨";
  }

  return closing.closingKind === "interim" ? "생성됨" : "마감됨";
}

function ClosingHistoryPanel({
  closings,
  kind,
}: {
  closings: MonthlySettlementClosing[];
  kind: MonthlySettlementClosingKind;
}) {
  const title = kind === "interim" ? "중간 결산 이력" : "최종 마감 이력";
  const kindLabel = kind === "interim" ? "중간 결산" : "최종 마감";

  return (
    <DataPanel
      aria-label={title}
      empty={
        <EmptyState
          description={`선택한 월에 ${kindLabel} 이력이 없습니다.`}
          title={`${kindLabel} 이력이 없습니다`}
        />
      }
      headerTitle={title}
    >
      {closings.length > 0 ? (
        <DataTable>
          <thead>
            <tr>
              <th scope="col">구분</th>
              <th scope="col">처리일</th>
              <th scope="col">처리자</th>
              <th scope="col">상태</th>
              <th scope="col">PDF</th>
            </tr>
          </thead>
          <tbody>
            {closings.map((closing) => (
              <tr key={closing.id}>
                <td>{kindLabel} v{closing.version}</td>
                <td>{formatSeoulProcessedDateTime(closing.closedAt)}</td>
                <td>{closing.closedBy}</td>
                <td>{formatClosingStatus(closing)}</td>
                <td>
                  <ActionLink
                    href={`/reports/monthly?snapshot=${closing.id}`}
                    size="compact"
                  >
                    PDF 다운로드
                  </ActionLink>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      ) : null}
    </DataPanel>
  );
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
  const interimClosingHistory = settlementPage.closingHistory.filter(
    (closing) => closing.closingKind === "interim",
  );
  const finalClosingHistory = settlementPage.closingHistory.filter(
    (closing) => closing.closingKind === "final",
  );

  const mutationControls = settlementPage.canCreateInterim ||
    settlementPage.canClose ||
    settlementPage.canReopen ? (
    <>
      {settlementPage.canCreateInterim ? (
        <form action={createInterimMonthlySettlement}>
          <input name="month" type="hidden" value={monthValue} />
          <input name="sort" type="hidden" value={sortState.key} />
          <input name="direction" type="hidden" value={sortState.direction} />
          <Button size="compact" type="submit" variant="secondary">
            중간 결산 생성
          </Button>
        </form>
      ) : null}
      {settlementPage.canClose ? (
        <form action={closeMonthlySettlement}>
          <input name="month" type="hidden" value={monthValue} />
          <input name="sort" type="hidden" value={sortState.key} />
          <input name="direction" type="hidden" value={sortState.direction} />
          <Button size="compact" type="submit">최종 마감</Button>
        </form>
      ) : null}
      {settlementPage.canReopen && settlementPage.activeClosing ? (
        <form action={reopenMonthlySettlement}>
          <input name="month" type="hidden" value={monthValue} />
          <input name="sort" type="hidden" value={sortState.key} />
          <input name="direction" type="hidden" value={sortState.direction} />
          <Button size="compact" type="submit" variant="danger">결산 재개</Button>
        </form>
      ) : null}
    </>
  ) : null;

  return (
    <ManagementPageTemplate
      filters={
        <FilterBar aria-label="결산 검색 필터" layout="single-control">
          <FormField label="결산 월">
            <TextInput
              defaultValue={monthValue}
              name="month"
              shape="pill"
              type="month"
            />
          </FormField>
          <input name="sort" type="hidden" value={sortState.key} />
          <input name="direction" type="hidden" value={sortState.direction} />
          <Button type="submit">조회</Button>
          {feedback ? (
            <p aria-live="polite" role="status">
              {feedback.text}
            </p>
          ) : null}
        </FilterBar>
      }
      kicker="월별 결산 요약"
      list={
        <>
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
          <ClosingHistoryPanel
            closings={interimClosingHistory}
            kind="interim"
          />
          <ClosingHistoryPanel closings={finalClosingHistory} kind="final" />
        </>
      }
      summary={
        <DataPanel
          aria-label={`${formatPeriodMonth(filters.periodMonth)} 결산`}
          headerSide={mutationControls}
          headerTitle={`${formatPeriodMonth(filters.periodMonth)} 결산`}
        >
          <SummaryGrid aria-label="결산 요약" columns={5} variant="divided">
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
                <SummaryCard label="최종 마감 버전" value={`v${settlementPage.activeClosing.version}`} />
                <SummaryCard label="최종 마감일" value={formatSeoulProcessedDateTime(settlementPage.activeClosing.closedAt)} />
                <SummaryCard label="최종 마감 처리자" value={settlementPage.activeClosing.closedBy} />
              </>
            ) : null}
          </SummaryGrid>
          {snapshot.feeTargetCount === 0 ? (
            <p>해당 월 회비 부과 대상 회원이 없습니다.</p>
          ) : null}
          {!settlementPage.activeClosing && settlementPage.closeBlockedReason ? (
            <p>현재 이 결산은 최종 마감할 수 없습니다.</p>
          ) : null}
        </DataPanel>
      }
      title="월별 결산"
    />
  );
}
