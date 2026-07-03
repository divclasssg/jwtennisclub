import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const expensesQuery = {
    eq: vi.fn(() => expensesQuery),
    maybeSingle: vi.fn(async () => ({
      data: { id: "expense-id", receipt_file_key: "expenses/operator-id/receipt.jpg" },
      error: null,
    })),
    select: vi.fn(() => expensesQuery),
  };
  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "operator-id" } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table !== "expenses") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return expensesQuery;
    }),
  };

  return {
    createReceiptDownloadUrl: vi.fn(async () => "https://signed.example/receipt"),
    expensesQuery,
    supabase,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mocks.supabase),
}));

vi.mock("@/lib/r2", () => ({
  createReceiptDownloadUrl: mocks.createReceiptDownloadUrl,
}));

import { GET } from "./route";

describe("expense receipt route", () => {
  it("redirects an authenticated operator to a signed receipt URL", async () => {
    const response = await GET(
      new Request(
        "http://localhost/expenses/receipts?key=expenses%2Foperator-id%2Freceipt.jpg",
      ),
    );

    expect(mocks.supabase.from).toHaveBeenCalledWith("expenses");
    expect(mocks.expensesQuery.eq).toHaveBeenCalledWith(
      "receipt_file_key",
      "expenses/operator-id/receipt.jpg",
    );
    expect(mocks.createReceiptDownloadUrl).toHaveBeenCalledWith(
      "expenses/operator-id/receipt.jpg",
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://signed.example/receipt");
  });
});
