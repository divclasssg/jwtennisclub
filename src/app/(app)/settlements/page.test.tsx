import { cleanup, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettlementsPage from "./page";

const feePayments = [
  {
    id: "payment-1",
    amount: 30000,
  },
  {
    id: "payment-2",
    amount: 50000,
  },
];

const expenses = [
  {
    id: "expense-1",
    category: "court",
    amount: 120000,
  },
  {
    id: "expense-2",
    category: "balls",
    amount: 10000,
  },
];

const queryState = {
  feePayments,
  expenses,
};

function createQueryBuilder(
  resolver: () => {
    data: unknown[];
    error: null;
  },
) {
  const queryBuilder = {
    select: vi.fn(() => queryBuilder),
    eq: vi.fn(() => queryBuilder),
    gte: vi.fn(() => queryBuilder),
    lt: vi.fn(() => queryBuilder),
    order: vi.fn(() => queryBuilder),
    then: vi.fn((resolve) => resolve(resolver())),
  };

  return queryBuilder;
}

const feePaymentsQuery = createQueryBuilder(() => ({
  data: queryState.feePayments,
  error: null,
}));
const expensesQuery = createQueryBuilder(() => ({
  data: queryState.expenses,
  error: null,
}));
const from = vi.fn((table: string) =>
  table === "fee_payments" ? feePaymentsQuery : expensesQuery,
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from })),
}));

describe("SettlementsPage", () => {
  beforeEach(() => {
    cleanup();
    queryState.feePayments = feePayments;
    queryState.expenses = expenses;
    from.mockClear();

    for (const query of [feePaymentsQuery, expensesQuery]) {
      query.select.mockClear();
      query.eq.mockClear();
      query.gte.mockClear();
      query.lt.mockClear();
      query.order.mockClear();
      query.then.mockClear();
    }
  });

  it("renders monthly settlement summary from fee payments and expenses", async () => {
    render(
      await SettlementsPage({
        searchParams: Promise.resolve({ month: "2026-07" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "월별 정산" })).toBeInTheDocument();
    expect(screen.getByLabelText("정산 월")).toHaveValue("2026-07");
    expect(screen.getByText("2026.07 정산")).toBeInTheDocument();
    expect(screen.getByText("수입 합계")).toBeInTheDocument();
    expect(screen.getByText("80,000원")).toBeInTheDocument();
    expect(screen.getByText("지출 합계")).toBeInTheDocument();
    expect(screen.getByText("130,000원")).toBeInTheDocument();
    expect(screen.getByText("정산 잔액")).toBeInTheDocument();
    expect(screen.getByText("-50,000원")).toBeInTheDocument();

    const settlementPanel = screen.getByRole("region", { name: "2026.07 정산" });
    const settlementSummary = within(settlementPanel).getByRole("region", {
      name: "정산 요약",
    });
    const feePaymentCard = within(settlementSummary)
      .getByText("회비 납부")
      .closest("article");
    const expenseCountCard = within(settlementSummary)
      .getByText("지출")
      .closest("article");

    expect(feePaymentCard).not.toBeNull();
    expect(expenseCountCard).not.toBeNull();
    expect(within(feePaymentCard as HTMLElement).getByText("2건")).toBeInTheDocument();
    expect(within(expenseCountCard as HTMLElement).getByText("2건")).toBeInTheDocument();
    expect(
      within(settlementSummary).queryByText("회비 납부 2건 · 지출 2건"),
    ).not.toBeInTheDocument();
    const filterForm = screen.getByRole("form", { name: "정산 검색 필터" });
    const pdfLink = within(filterForm).getByRole("link", { name: "PDF 다운로드" });
    const submitButton = within(filterForm).getByRole("button", { name: "조회" });
    const filterChildren = Array.from(filterForm.children);

    expect(filterChildren.indexOf(pdfLink)).toBe(
      filterChildren.indexOf(submitButton) + 1,
    );
    expect(pdfLink).toHaveAttribute(
      "href",
      "/reports/monthly?month=2026-07",
    );

    const categories = screen.getByRole("region", { name: "카테고리별 지출" });
    expect(within(categories).getByRole("cell", { name: "코트" })).toBeInTheDocument();
    expect(within(categories).getByRole("cell", { name: "120,000원" })).toBeInTheDocument();
    expect(within(categories).getByRole("cell", { name: "공" })).toBeInTheDocument();
    expect(within(categories).getByRole("cell", { name: "10,000원" })).toBeInTheDocument();
  });

  it("renders an empty category state when the month has no expenses", async () => {
    queryState.feePayments = [feePayments[0]];
    queryState.expenses = [];

    render(
      await SettlementsPage({
        searchParams: Promise.resolve({ month: "2026-07" }),
      }),
    );

    const settlementSummary = screen.getByRole("region", { name: "정산 요약" });
    const feePaymentCard = within(settlementSummary)
      .getByText("회비 납부")
      .closest("article");
    const expenseCountCard = within(settlementSummary)
      .getByText("지출")
      .closest("article");

    expect(feePaymentCard).not.toBeNull();
    expect(expenseCountCard).not.toBeNull();
    expect(within(feePaymentCard as HTMLElement).getByText("1건")).toBeInTheDocument();
    expect(within(expenseCountCard as HTMLElement).getByText("0건")).toBeInTheDocument();
    expect(screen.getByText("30,000원")).toBeInTheDocument();
    expect(screen.getByText("+30,000원")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "카테고리별 지출이 없습니다" })).toBeInTheDocument();
  });

  it("sorts settlement category rows and preserves the selected month", async () => {
    render(await SettlementsPage({
      searchParams: Promise.resolve({
        month: "2026-07",
        sort: "amount",
        direction: "asc",
      }),
    }));

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual(["공", "코트"]);
    expect(screen.getByRole("link", { name: "금액 오름차순 정렬" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "건수 내림차순 정렬" })).toHaveAttribute(
      "href",
      "/settlements?month=2026-07&sort=count&direction=desc",
    );
  });
});
