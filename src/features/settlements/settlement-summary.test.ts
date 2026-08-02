import { describe, expect, it } from "vitest";
import {
  buildSettlementSummary,
  formatSettlementBalance,
  normalizeSettlementFilters,
} from "./settlement-summary";

describe("normalizeSettlementFilters", () => {
  it("normalizes month query values to the first day of the month", () => {
    expect(
      normalizeSettlementFilters({ month: "2026-07" }, "2026-06-01"),
    ).toEqual({
      periodMonth: "2026-07-01",
    });
  });

  it("falls back to the provided month for invalid query values", () => {
    expect(
      normalizeSettlementFilters({ month: "invalid" }, "2026-06-01"),
    ).toEqual({
      periodMonth: "2026-06-01",
    });
  });
});

describe("buildSettlementSummary", () => {
  it("calculates monthly income, expenses, attributed net, and expense category totals", () => {
    const summary = buildSettlementSummary({
      feePayments: [
        { amount: 30000 },
        { amount: 30000 },
        { amount: 50000 },
      ],
      expenses: [
        { amount: 120000, category: "court" },
        { amount: 20000, category: "balls" },
        { amount: 10000, category: "balls" },
      ],
    });

    expect(summary).toEqual({
      incomeTotal: 110000,
      expenseTotal: 150000,
      attributedNet: -40000,
      feePaymentCount: 3,
      expenseCount: 3,
      expenseCategoryRows: [
        { category: "court", amount: 120000, count: 1 },
        { category: "balls", amount: 30000, count: 2 },
      ],
    });
  });
});

describe("formatSettlementBalance", () => {
  it("marks positive and negative balances for Korean operators", () => {
    expect(formatSettlementBalance(40000)).toBe("+40,000원");
    expect(formatSettlementBalance(-40000)).toBe("-40,000원");
    expect(formatSettlementBalance(0)).toBe("0원");
  });
});
