import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettlementsPage from "./page";

function buildSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    period_month: "2026-07-01",
    monthly_fee_amount: 30000,
    activity_member_count: 21,
    fee_target_count: 20,
    fully_paid_count: 17,
    unpaid_count: 3,
    billed_total: 600000,
    actual_fee_income: 525000,
    recognized_paid_total: 510000,
    adjustment_income: 15000,
    unpaid_total: 90000,
    expense_total: 130000,
    expense_count: 2,
    attributed_net: 395000,
    opening_ledger_balance: 0,
    closing_ledger_balance: 395000,
    expense_category_rows: [
      { category: "court", count: 1, amount: 120000 },
      { category: "balls", count: 1, amount: 10000 },
    ],
    expense_rows: [
      {
        expense_date: "2026-07-03",
        category: "court",
        description: "코트 대관",
        amount: 120000,
      },
      {
        expense_date: "2026-07-12",
        category: "balls",
        description: "테니스 공",
        amount: 10000,
      },
    ],
    ...overrides,
  };
}

const pageState = {
  data: {
    preview: buildSnapshot(),
    active_closing: null as Record<string, unknown> | null,
    can_close: true,
    can_reopen: false,
    close_blocked_reason: null as string | null,
  },
};

const rpc = vi.fn(async () => ({ data: pageState.data, error: null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc })),
}));

describe("SettlementsPage", () => {
  beforeEach(() => {
    cleanup();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T00:00:00+09:00"));
    rpc.mockClear();
    pageState.data = {
      preview: buildSnapshot(),
      active_closing: null,
      can_close: true,
      can_reopen: false,
      close_blocked_reason: null,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the authoritative open preview and its close action", async () => {
    render(
      await SettlementsPage({
        searchParams: Promise.resolve({ month: "2026-07" }),
      }),
    );

    expect(rpc).toHaveBeenCalledWith("get_monthly_settlement_page", {
      requested_period_month: "2026-07-01",
    });
    expect(screen.getByText("월말 활동 회원")).toBeInTheDocument();
    expect(screen.getByText("21명")).toBeInTheDocument();
    expect(screen.getByText("회비 부과 대상")).toBeInTheDocument();
    expect(screen.getByText("20명")).toBeInTheDocument();
    expect(screen.getByText("완납 회원")).toBeInTheDocument();
    expect(screen.getByText("17명")).toBeInTheDocument();
    expect(screen.getByText("미납 회원")).toBeInTheDocument();
    expect(screen.getByText("3명")).toBeInTheDocument();
    expect(screen.getByText("총 청구액")).toBeInTheDocument();
    expect(screen.getByText("600,000원")).toBeInTheDocument();
    expect(screen.getByText("실제 회비 수납액")).toBeInTheDocument();
    expect(screen.getByText("525,000원")).toBeInTheDocument();
    expect(screen.getByText("인정 납부액")).toBeInTheDocument();
    expect(screen.getByText("510,000원")).toBeInTheDocument();
    expect(screen.getByText("조정 수납액")).toBeInTheDocument();
    expect(screen.getByText("15,000원")).toBeInTheDocument();
    expect(screen.getByText("미납액")).toBeInTheDocument();
    expect(screen.getByText("90,000원")).toBeInTheDocument();
    expect(screen.getByText("운영 지출")).toBeInTheDocument();
    expect(screen.getByText("130,000원")).toBeInTheDocument();
    expect(screen.getByText("당월 귀속 수지")).toBeInTheDocument();
    expect(screen.getAllByText("+395,000원")).not.toHaveLength(0);
    expect(screen.getByText("기초 장부 잔액")).toBeInTheDocument();
    expect(screen.getByText("기말 장부 잔액")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "정산 마감" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "정산 재개" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "PDF 다운로드" })).not.toBeInTheDocument();
  });

  it("preserves the validated category sort state when looking up another month", async () => {
    render(
      await SettlementsPage({
        searchParams: Promise.resolve({
          month: "2026-07",
          sort: "amount",
          direction: "desc",
        }),
      }),
    );

    const filterForm = screen.getByRole("form", {
      name: "정산 검색 필터",
    }) as HTMLFormElement;
    expect(filterForm.elements.namedItem("sort")).toHaveValue("amount");
    expect(filterForm.elements.namedItem("direction")).toHaveValue("desc");
  });

  it("renders the active closing snapshot, metadata, reopen action, and eligible PDF link", async () => {
    pageState.data = {
      preview: buildSnapshot({
        actual_fee_income: 510000,
        recognized_paid_total: 510000,
        adjustment_income: 0,
        attributed_net: 380000,
        closing_ledger_balance: 380000,
      }),
      active_closing: {
        id: "128a3398-389b-46c9-9314-b795166fa5d0",
        period_month: "2026-07-01",
        version: 2,
        status: "closed",
        snapshot: buildSnapshot(),
        closed_at: "2026-08-02T03:00:00+09:00",
        closed_by: "김마감",
      },
      can_close: false,
      can_reopen: true,
      close_blocked_reason: "already-closed",
    };

    render(
      await SettlementsPage({
        searchParams: Promise.resolve({
          month: "2026-07",
          sort: "amount",
          direction: "desc",
        }),
      }),
    );

    expect(screen.getByText("마감 버전")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("마감 처리자")).toBeInTheDocument();
    expect(screen.getByText("김마감")).toBeInTheDocument();
    expect(screen.getByText("마감일")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "정산 재개" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "정산 마감" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PDF 다운로드" })).toHaveAttribute(
      "href",
      "/reports/monthly?month=2026-07",
    );
    expect(screen.getByRole("link", { name: "금액 오름차순 정렬" })).toHaveAttribute(
      "href",
      "/settlements?month=2026-07&sort=amount&direction=asc",
    );
  });

  it("renders the approved empty notice for months without fee targets", async () => {
    pageState.data.preview = buildSnapshot({
      activity_member_count: 0,
      fee_target_count: 0,
      fully_paid_count: 0,
      unpaid_count: 0,
      billed_total: 0,
      actual_fee_income: 0,
      recognized_paid_total: 0,
      adjustment_income: 0,
      unpaid_total: 0,
      expense_total: 0,
      expense_count: 0,
      attributed_net: 0,
      opening_ledger_balance: 0,
      closing_ledger_balance: 0,
      expense_category_rows: [],
      expense_rows: [],
    });

    render(
      await SettlementsPage({
        searchParams: Promise.resolve({ month: "2026-07" }),
      }),
    );

    expect(
      screen.getByText("해당 월 회비 부과 대상 회원이 없습니다."),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "정산 요약" })).getAllByText("0원"),
    ).not.toHaveLength(0);
  });
});
