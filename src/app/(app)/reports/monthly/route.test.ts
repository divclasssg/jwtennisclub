import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const feePaymentsQuery = {
    eq: vi.fn(() => feePaymentsQuery),
    order: vi.fn(() =>
      Promise.resolve({
        data: [{ id: "payment-1", amount: 30000 }],
        error: null,
      }),
    ),
    select: vi.fn(() => feePaymentsQuery),
  };
  const expensesQuery = {
    gte: vi.fn(() => expensesQuery),
    lt: vi.fn(() => expensesQuery),
    order: vi.fn(() =>
      Promise.resolve({
        data: [
          {
            id: "expense-1",
            amount: 120000,
            category: "court",
            description: "코트 대관",
            expense_date: "2026-06-12",
            memo: "내부 메모",
          },
        ],
        error: null,
      }),
    ),
    select: vi.fn(() => expensesQuery),
  };
  const profilesQuery = {
    eq: vi.fn(() => profilesQuery),
    maybeSingle: vi.fn(() =>
      Promise.resolve({
        data: { display_name: "김운영" },
        error: null,
      }),
    ),
    select: vi.fn(() => profilesQuery),
  };
  const supabase = {
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({
          data: { user: { id: "operator-id", email: "operator@example.com" } },
          error: null,
        }),
      ),
    },
    from: vi.fn((table: string) => {
      if (table === "fee_payments") {
        return feePaymentsQuery;
      }

      if (table === "expenses") {
        return expensesQuery;
      }

      if (table === "profiles") {
        return profilesQuery;
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return {
    feePaymentsQuery,
    renderMonthlyReportPdf: vi.fn(() =>
      Promise.resolve(Buffer.from("%PDF monthly report")),
    ),
    supabase,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mocks.supabase),
}));

vi.mock("@/features/reports/MonthlyReportPdf", () => ({
  renderMonthlyReportPdf: mocks.renderMonthlyReportPdf,
}));

import { GET } from "./route";

describe("monthly report route", () => {
  it("returns a PDF attachment for an authenticated operator", async () => {
    const response = await GET(
      new Request("http://localhost/reports/monthly?month=2026-06"),
    );

    expect(mocks.supabase.from).toHaveBeenCalledWith("fee_payments");
    expect(mocks.feePaymentsQuery.eq).toHaveBeenCalledWith(
      "period_month",
      "2026-06-01",
    );
    expect(mocks.renderMonthlyReportPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        generatedBy: "김운영",
        incomeTotal: 30000,
        expenseTotal: 120000,
      }),
    );
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(
      "jw-tennis-club-2026-06-report.pdf",
    );
    expect(await response.text()).toBe("%PDF monthly report");
  });
});
