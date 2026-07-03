import { describe, expect, it } from "vitest";
import {
  normalizeExpenseInput,
  toExpenseDatabaseInput,
  validateExpenseForm,
} from "./expense-form";

describe("expense form validation", () => {
  it("accepts a valid expense", () => {
    const expense = normalizeExpenseInput({
      expenseDate: "2026-07-03",
      category: "court",
      description: "야간 코트 대관",
      amount: "120000",
      memo: "7월 정기 모임",
    });

    expect(validateExpenseForm(expense)).toEqual([]);
    expect(toExpenseDatabaseInput(expense)).toEqual({
      expense_date: "2026-07-03",
      category: "court",
      description: "야간 코트 대관",
      amount: 120000,
      has_receipt: false,
      memo: "7월 정기 모임",
    });
  });

  it("rejects invalid required fields", () => {
    const expense = normalizeExpenseInput({
      expenseDate: "2026/07/03",
      category: "bad",
      description: "",
      amount: "0",
    });

    expect(validateExpenseForm(expense)).toEqual([
      "사용일을 YYYY-MM-DD 형식으로 입력하세요.",
      "카테고리를 선택하세요.",
      "내용을 입력하세요.",
      "지출 금액은 1원 이상의 정수로 입력하세요.",
    ]);
  });
});
