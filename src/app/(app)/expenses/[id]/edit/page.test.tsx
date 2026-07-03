import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditExpensePage from "./page";

const expensesQuery = {
  eq: vi.fn(() => expensesQuery),
  maybeSingle: vi.fn(async () => ({
    data: {
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
    error: null,
  })),
  select: vi.fn(() => expensesQuery),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => expensesQuery),
  })),
}));

vi.mock("../../actions", () => ({
  updateExpense: vi.fn(),
}));

describe("EditExpensePage", () => {
  beforeEach(() => {
    expensesQuery.eq.mockClear();
    expensesQuery.maybeSingle.mockClear();
    expensesQuery.select.mockClear();
  });

  it("renders the expense edit form with existing values", async () => {
    render(
      await EditExpensePage({
        params: Promise.resolve({ id: "expense-1" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole("heading", { name: "코트 대관" })).toBeInTheDocument();
    expect(screen.getByLabelText("사용일")).toHaveValue("2026-07-03");
    expect(screen.getByLabelText("카테고리")).toHaveValue("court");
    expect(screen.getByLabelText("내용")).toHaveValue("코트 대관");
    expect(screen.getByLabelText("금액")).toHaveValue(120000);
    expect(screen.getByText("현재 영수증: receipt.jpg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "영수증 삭제" })).toHaveAttribute(
      "name",
      "intent",
    );
    expect(screen.getByRole("button", { name: "변경 저장" })).toBeInTheDocument();
  });
});
