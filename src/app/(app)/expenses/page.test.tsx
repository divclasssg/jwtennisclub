import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExpensesPage from "./page";

vi.mock("./actions", () => ({
  deleteExpense: vi.fn(),
}));

type ExpenseFixture = {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  has_receipt: boolean;
  receipt_content_type: string | null;
  receipt_file_key: string | null;
  receipt_file_name: string | null;
  receipt_file_size: number | null;
  memo: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

const expenses: ExpenseFixture[] = [
  {
    id: "expense-1",
    expense_date: "2026-07-03",
    category: "court",
    description: "코트 대관",
    amount: 120000,
    has_receipt: true,
    receipt_content_type: "image/jpeg",
    receipt_file_key: "expenses/operator-id/2026/07/receipt.jpg",
    receipt_file_name: "receipt.jpg",
    receipt_file_size: 7,
    memo: "야간 경기",
    created_by: "operator-id",
    updated_by: "operator-id",
    created_at: "2026-07-03T00:00:00Z",
    updated_at: "2026-07-03T00:00:00Z",
  },
];

const expensesQuery = {
  select: vi.fn(() => expensesQuery),
  gte: vi.fn(() => expensesQuery),
  lt: vi.fn(() => expensesQuery),
  eq: vi.fn(() => expensesQuery),
  order: vi.fn(async () => ({ data: expenses, error: null })),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => expensesQuery),
  })),
}));

describe("ExpensesPage", () => {
  beforeEach(() => {
    expensesQuery.select.mockClear();
    expensesQuery.gte.mockClear();
    expensesQuery.lt.mockClear();
    expensesQuery.eq.mockClear();
    expensesQuery.order.mockClear();
  });

  it("renders monthly expenses with filters and summary", async () => {
    render(
      await ExpensesPage({
        searchParams: Promise.resolve({ month: "2026-07", category: "court" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "지출 관리" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "지출 등록" })).toHaveAttribute(
      "href",
      "/expenses/new",
    );
    expect(screen.getByLabelText("사용 월")).toHaveValue("2026-07");
    expect(screen.getByLabelText("카테고리")).toHaveValue("court");
    expect(screen.getByText("지출 합계")).toBeInTheDocument();
    expect(screen.getAllByText("120,000원").length).toBeGreaterThan(0);

    const list = screen.getByRole("region", { name: "월별 지출 목록" });
    expect(within(list).getByText("2026.07 · 총 1건")).toBeInTheDocument();
    expect(within(list).getByRole("cell", { name: "코트" })).toBeInTheDocument();
    expect(within(list).getByRole("cell", { name: "코트 대관" })).toBeInTheDocument();
    expect(within(list).getByRole("link", { name: "영수증 보기" })).toHaveAttribute(
      "href",
      "/expenses/receipts?key=expenses%2Foperator-id%2F2026%2F07%2Freceipt.jpg",
    );
    expect(within(list).getByRole("link", { name: "수정" })).toHaveAttribute(
      "href",
      "/expenses/expense-1/edit",
    );
    expect(within(list).getByRole("button", { name: "삭제" })).toBeInTheDocument();
  });

  it("sorts expense rows and preserves month and category in sort links", async () => {
    expensesQuery.order.mockResolvedValueOnce({
      data: [
        expenses[0],
        {
          ...expenses[0],
          id: "expense-2",
          expense_date: "2026-07-01",
          category: "supplies",
          description: "공 구입",
          amount: 30000,
          memo: null,
          receipt_file_key: null,
        },
      ],
      error: null,
    });

    render(await ExpensesPage({
      searchParams: Promise.resolve({
        month: "2026-07",
        category: "court",
        sort: "amount",
        direction: "asc",
      }),
    }));

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[2].textContent)).toEqual(["공 구입", "코트 대관"]);
    expect(screen.getByRole("link", { name: "금액 오름차순 정렬" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "메모 내림차순 정렬" })).toHaveAttribute(
      "href",
      "/expenses?month=2026-07&category=court&sort=memo&direction=desc",
    );
    expect(screen.queryByRole("link", { name: "증빙 오름차순 정렬" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "관리 오름차순 정렬" })).not.toBeInTheDocument();
  });
});
