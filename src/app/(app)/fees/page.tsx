import styles from "./page.module.scss";
import { cancelFeePayment, createFeePayment } from "./actions";
import { ActionLink, Badge, Button, SelectInput, TextInput } from "@/components/atoms";
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
import {
  buildFeeBoardRows,
  buildFeeListSummary,
  FEE_PAYMENT_STATUS_FILTERS,
  formatCurrency,
  formatPeriodMonth,
  mapFeePaymentRow,
  normalizeFeeListFilters,
  type FeeListSearchParams,
} from "@/features/fees/fee-list";
import {
  DEFAULT_MONTHLY_FEE_AMOUNT,
  getPeriodMonthEnd,
} from "@/features/fees/fee-model";
import {
  applyOperatorPositionInfo,
  formatDate,
  formatMemberKind,
  mapMemberRow,
} from "@/features/members/member-list";

type FeesPageProps = {
  searchParams: Promise<FeeListSearchParams>;
};

type OperatorPositionDatabaseRow = {
  id: string;
  club_positions:
    | {
        name: string | null;
        sort_order: number | null;
      }
    | {
        name: string | null;
        sort_order: number | null;
      }[]
    | null;
};

function buildSearchPattern(query: string) {
  return `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

function mapOperatorPositionRows(rows: OperatorPositionDatabaseRow[]) {
  return new Map(
    rows.map((row) => {
      const position = Array.isArray(row.club_positions)
        ? row.club_positions[0]
        : row.club_positions;

      return [
        row.id,
        {
          name: position?.name ?? null,
          sortOrder: position?.sort_order ?? null,
        },
      ];
    }),
  );
}

async function getFeePayments(periodMonth: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fee_payments")
    .select(
      "id, member_id, period_month, amount, paid_date, memo, created_by, updated_by, created_at, updated_at, members(name, phone_last_four)",
    )
    .eq("period_month", periodMonth)
    .order("paid_date", { ascending: false });

  if (error) {
    throw new Error("회비 납부 목록을 불러오지 못했습니다.");
  }

  return (data ?? []).map(mapFeePaymentRow);
}

async function getFeeTargetMembers(periodMonth: string, query: string) {
  const supabase = await createClient();
  let request = supabase
    .from("members")
    .select(
      "id, name, phone_last_four, operator_profile_id, status, joined_date, withdrawn_date, withdrawal_reason, memo",
    )
    .eq("status", "active")
    .lte("joined_date", getPeriodMonthEnd(periodMonth))
    .order("name", { ascending: true });

  if (query) {
    const pattern = buildSearchPattern(query);
    request = request.or(`name.ilike.${pattern},phone_last_four.ilike.${pattern}`);
  }

  const { data, error } = await request;

  if (error) {
    throw new Error("회비 청구 대상 회원을 불러오지 못했습니다.");
  }

  const members = (data ?? []).map(mapMemberRow);
  const operatorProfileIds = members
    .map((member) => member.operatorProfileId)
    .filter((id) => id !== null);

  if (operatorProfileIds.length === 0) {
    return members;
  }

  const { data: positionRows, error: positionError } = await supabase
    .from("profiles")
    .select("id, club_positions(name, sort_order)")
    .in("id", operatorProfileIds);

  if (positionError) {
    throw new Error("운영진 직책을 불러오지 못했습니다.");
  }

  const positionMap = mapOperatorPositionRows(positionRows ?? []);

  return members.map((member) =>
    applyOperatorPositionInfo(
      member,
      member.operatorProfileId
        ? (positionMap.get(member.operatorProfileId) ?? null)
        : null,
    ),
  );
}

function getTodayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatPaymentStatus(row: { payment: unknown }) {
  return row.payment ? "납부완료" : "미납";
}

function formatStatusFilterLabel(status: (typeof FEE_PAYMENT_STATUS_FILTERS)[number]) {
  if (status === "paid") {
    return "납부완료";
  }

  if (status === "unpaid") {
    return "미납";
  }

  return "전체";
}

export default async function FeesPage({ searchParams }: FeesPageProps) {
  const filters = normalizeFeeListFilters(await searchParams);
  const [payments, targetMembers] = await Promise.all([
    getFeePayments(filters.periodMonth),
    getFeeTargetMembers(filters.periodMonth, filters.query),
  ]);
  const boardRows = buildFeeBoardRows({
    members: targetMembers,
    payments,
    query: filters.query,
    status: filters.status,
  });
  const summary = buildFeeListSummary({
    expectedCount: targetMembers.length,
    payments: targetMembers
      .map((member) => payments.find((payment) => payment.memberId === member.id))
      .filter((payment) => payment !== undefined),
  });
  const hasFilters = filters.query || filters.status !== "all";
  const today = getTodayInputValue();

  return (
    <ManagementPageTemplate
      action={<ActionLink href="/fees/new">CSV 등록</ActionLink>}
      description={
        <>
          월을 선택한 뒤 회원별 납부 상태를 바로 확인하고 미납 행에서 즉시 납부
          처리합니다. 기본 회비는 30,000원입니다.
        </>
      }
      filters={
        <FilterBar aria-label="회비 검색 필터" layout="month-search-status">
          <FormField label="납부 월">
            <TextInput
              defaultValue={filters.periodMonth.slice(0, 7)}
              name="month"
              shape="pill"
              type="month"
            />
          </FormField>
          <FormField label="검색">
            <TextInput
              defaultValue={filters.query}
              name="q"
              placeholder="이름 또는 뒤 4자리"
              shape="pill"
              type="search"
            />
          </FormField>
          <FormField label="상태">
            <SelectInput defaultValue={filters.status} name="status" shape="pill">
              {FEE_PAYMENT_STATUS_FILTERS.map((status) => (
                <option key={status} value={status}>
                  {formatStatusFilterLabel(status)}
                </option>
              ))}
            </SelectInput>
          </FormField>
          <Button type="submit">조회</Button>
        </FilterBar>
      }
      kicker="회비 관리"
      list={
        <DataPanel
          aria-label="월별 회비 체크판"
          empty={
            <EmptyState
              description={
                <>
                  납부 월, 검색어, 상태 필터를 조정해서 회비 대상 회원을 확인하세요.
                </>
              }
              title="표시할 회원이 없습니다"
            />
          }
          headerSide={hasFilters ? <a href="/fees">필터 초기화</a> : null}
          headerTitle={`${formatPeriodMonth(filters.periodMonth)} · 총 ${boardRows.length}명`}
        >
          {boardRows.length > 0 ? (
            <DataTable>
              <thead>
                <tr>
                  <th scope="col">회원</th>
                  <th scope="col">연락처</th>
                  <th scope="col">구분</th>
                  <th scope="col">상태</th>
                  <th scope="col">기준 금액</th>
                  <th scope="col">납부일</th>
                  <th scope="col">메모</th>
                  <th scope="col">처리</th>
                </tr>
              </thead>
              <tbody>
                {boardRows.map((row) => (
                  <tr key={row.memberId}>
                    <th scope="row">{row.memberName}</th>
                    <td>{row.memberPhoneLastFour ?? "-"}</td>
                    <td>
                      <Badge tone={row.operatorProfileId ? "info" : "muted"}>
                        {formatMemberKind(row)}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={row.payment ? "success" : "danger"}>
                        {formatPaymentStatus(row)}
                      </Badge>
                    </td>
                    <td>
                      {formatCurrency(
                        row.payment?.amount ?? DEFAULT_MONTHLY_FEE_AMOUNT,
                      )}
                      원
                    </td>
                    <td>{row.payment ? formatDate(row.payment.paidDate) : "-"}</td>
                    <td>{row.payment?.memo ?? "-"}</td>
                    <td>
                      {row.payment ? (
                        <form
                          action={cancelFeePayment}
                          className={styles["fees-inline-form"]}
                        >
                          <input
                            name="paymentId"
                            type="hidden"
                            value={row.payment.id}
                          />
                          <input
                            name="periodMonth"
                            type="hidden"
                            value={filters.periodMonth.slice(0, 7)}
                          />
                          <Button size="compact" type="submit" variant="danger">
                            납부 취소
                          </Button>
                        </form>
                      ) : (
                        <form
                          action={createFeePayment}
                          className={styles["fees-inline-form"]}
                        >
                          <input name="memberId" type="hidden" value={row.memberId} />
                          <input
                            name="periodMonth"
                            type="hidden"
                            value={filters.periodMonth.slice(0, 7)}
                          />
                          <input name="paidDate" type="hidden" value={today} />
                          <input
                            name="amount"
                            type="hidden"
                            value={DEFAULT_MONTHLY_FEE_AMOUNT}
                          />
                          <Button size="compact" type="submit">
                            납부 처리
                          </Button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ) : null}
        </DataPanel>
      }
      summary={
        <SummaryGrid aria-label="회비 요약" columns={4}>
          <SummaryCard label="청구 대상" value={`${summary.expectedCount}명`} />
          <SummaryCard label="납부 완료" value={`${summary.paidCount}명`} />
          <SummaryCard label="미납" value={`${summary.unpaidCount}명`} />
          <SummaryCard
            label="납부 합계"
            value={`${formatCurrency(summary.paidTotal)}원`}
          />
        </SummaryGrid>
      }
      title="월별 회비 현황"
    />
  );
}
