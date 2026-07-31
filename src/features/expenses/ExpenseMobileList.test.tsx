import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ExpenseRecord } from "./expense-model";
import { ExpenseMobileList } from "./ExpenseMobileList";

const expense: ExpenseRecord = {
  id: "expense-1",
  expenseDate: "2026-07-03",
  category: "court",
  description: "코트 대관",
  amount: 120000,
  hasReceipt: true,
  receiptContentType: "image/jpeg",
  receiptFileKey: "expenses/operator/receipt.jpg",
  receiptFileName: "receipt.jpg",
  receiptFileSize: 7,
  memo: "야간 경기 메모",
  createdBy: "operator-id",
  updatedBy: "operator-id",
  createdAt: "2026-07-03T00:00:00Z",
  updatedAt: "2026-07-03T00:00:00Z",
};

describe("ExpenseMobileList", () => {
  it("preserves receipt access but hides mutation actions when locked", () => {
    render(
      <ExpenseMobileList
        deleteAction={vi.fn(async () => undefined)}
        expenses={[expense]}
        isLocked
      />,
    );

    expect(screen.getByRole("link", { name: "영수증 보기" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "수정" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
  });

  it("renders essential expense details and actions without the memo", () => {
    const deleteAction = vi.fn(async () => undefined);

    render(
      <ExpenseMobileList
        deleteAction={deleteAction}
        expenses={[expense]}
      />,
    );

    const list = screen.getByRole("list", { name: "모바일 지출 목록" });

    expect(
      within(list).getByRole("heading", { name: "코트 대관" }),
    ).toBeInTheDocument();
    expect(within(list).getByText("2026.07.03")).toBeInTheDocument();
    expect(within(list).getByText("코트")).toBeInTheDocument();
    expect(within(list).getByText("120,000원")).toBeInTheDocument();
    expect(
      within(list).getByRole("link", { name: "영수증 보기" }),
    ).toHaveAttribute(
      "href",
      "/expenses/receipts?key=expenses%2Foperator%2Freceipt.jpg",
    );
    expect(within(list).getByRole("link", { name: "수정" })).toHaveAttribute(
      "href",
      "/expenses/expense-1/edit",
    );
    expect(
      within(list).getByRole("button", { name: "삭제" }),
    ).toBeInTheDocument();
    expect(within(list).queryByText("야간 경기 메모")).not.toBeInTheDocument();
  });
});
