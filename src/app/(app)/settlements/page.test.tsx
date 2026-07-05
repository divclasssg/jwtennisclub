import { render, screen, within } from "@testing-library/react";
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

    expect(screen.getByRole("heading", { name: "월별 정산 요약" })).toBeInTheDocument();
    expect(screen.getByLabelText("정산 월")).toHaveValue("2026-07");
    expect(screen.getByText("2026.07 정산")).toBeInTheDocument();
    expect(screen.getByText("수입 합계")).toBeInTheDocument();
    expect(screen.getByText("80,000원")).toBeInTheDocument();
    expect(screen.getByText("지출 합계")).toBeInTheDocument();
    expect(screen.getByText("130,000원")).toBeInTheDocument();
    expect(screen.getByText("정산 잔액")).toBeInTheDocument();
    expect(screen.getByText("-50,000원")).toBeInTheDocument();
    expect(screen.getByText("회비 납부 2건 · 지출 2건")).toBeInTheDocument();

    const categories = screen.getByRole("region", { name: "카테고리별 지출" });
    expect(within(categories).getByRole("cell", { name: "코트" })).toBeInTheDocument();
    expect(within(categories).getByRole("cell", { name: "120,000원" })).toBeInTheDocument();
    expect(within(categories).getByRole("cell", { name: "공" })).toBeInTheDocument();
    expect(within(categories).getByRole("cell", { name: "10,000원" })).toBeInTheDocument();
  });

  it("renders an empty category state when the month has no expenses", async () => {
    queryState.feePayments = [];
    queryState.expenses = [];

    render(
      await SettlementsPage({
        searchParams: Promise.resolve({ month: "2026-07" }),
      }),
    );

    expect(screen.getAllByText("0원").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "카테고리별 지출이 없습니다" })).toBeInTheDocument();
  });
});
