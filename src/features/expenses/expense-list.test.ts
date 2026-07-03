import { describe, expect, it } from "vitest";
import {
  buildExpenseListSummary,
  mapExpenseRow,
  normalizeExpenseListFilters,
} from "./expense-list";

describe("expense list helpers", () => {
  it("normalizes month filters and maps database rows", () => {
    expect(
      normalizeExpenseListFilters({ month: "2026-07", category: "court" }),
    ).toEqual({
      periodMonth: "2026-07-01",
      category: "court",
    });

    expect(
      mapExpenseRow({
        id: "expense-1",
        expense_date: "2026-07-03",
        category: "court",
        description: "코트 대관",
        amount: 120000,
        has_receipt: true,
        receipt_content_type: null,
        receipt_file_key: null,
        receipt_file_name: null,
        receipt_file_size: null,
        memo: null,
        created_by: "operator-id",
        updated_by: "operator-id",
        created_at: "2026-07-03T00:00:00Z",
        updated_at: "2026-07-03T00:00:00Z",
      }),
    ).toMatchObject({
      id: "expense-1",
      expenseDate: "2026-07-03",
      category: "court",
      description: "코트 대관",
      amount: 120000,
      hasReceipt: true,
    });
  });

  it("summarizes count and total amount", () => {
    expect(
      buildExpenseListSummary([
        { amount: 120000 },
        { amount: 30000 },
      ]),
    ).toEqual({ count: 2, totalAmount: 150000 });
  });
});
