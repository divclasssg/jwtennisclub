import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const deleteQuery = {
    eq: vi.fn(async () => ({ error: null })),
  };
  const feePaymentsTable = {
    delete: vi.fn(() => deleteQuery),
    insert: vi.fn(async () => ({ error: null })),
  };
  const membersQuery = {
    select: vi.fn(() => membersQuery),
    eq: vi.fn(async () => ({
      data: [
        {
          id: "member-1",
          member_code: "M0001",
        },
      ],
      error: null,
    })),
  };
  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "operator-id" } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "fee_payments") {
        return feePaymentsTable;
      }

      if (table === "members") {
        return membersQuery;
      }

        throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return {
    deleteQuery,
    feePaymentsTable,
    membersQuery,
    revalidatePath: vi.fn(),
    redirect: vi.fn((path: string) => {
      throw new Error(`redirect:${path}`);
    }),
    supabase,
  };
});

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mocks.supabase),
}));

import { cancelFeePayment, importFeePaymentsCsv } from "./actions";

describe("fee payment actions", () => {
  beforeEach(() => {
    mocks.redirect.mockClear();
    mocks.revalidatePath.mockClear();
    mocks.supabase.auth.getUser.mockClear();
    mocks.supabase.from.mockClear();
    mocks.feePaymentsTable.delete.mockClear();
    mocks.feePaymentsTable.insert.mockClear();
    mocks.membersQuery.select.mockClear();
    mocks.membersQuery.eq.mockClear();
    mocks.deleteQuery.eq.mockClear();
    mocks.deleteQuery.eq.mockResolvedValue({ error: null });
    mocks.feePaymentsTable.insert.mockResolvedValue({ error: null });
  });

  it("cancels a fee payment and returns to the selected month", async () => {
    const formData = new FormData();
    formData.set("paymentId", "payment-1");
    formData.set("periodMonth", "2026-07");

    await expect(cancelFeePayment(formData)).rejects.toThrow(
      "redirect:/fees?status=cancelled&month=2026-07",
    );

    expect(mocks.supabase.from).toHaveBeenCalledWith("fee_payments");
    expect(mocks.feePaymentsTable.delete).toHaveBeenCalled();
    expect(mocks.deleteQuery.eq).toHaveBeenCalledWith("id", "payment-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/fees");
  });

  it("imports fee payments from CSV by matching active members", async () => {
    const formData = new FormData();
    formData.set(
      "csvFile",
      new File(
        [
          [
            "memberCode,periodMonth,amount,paidDate,memo",
            "m0001,2026-07,30000,2026-07-03,7월 회비",
          ].join("\n"),
        ],
        "fees.csv",
        { type: "text/csv" },
      ),
    );

    await expect(importFeePaymentsCsv(formData)).rejects.toThrow(
      "redirect:/fees?status=imported&count=1&month=2026-07",
    );

    expect(mocks.supabase.from).toHaveBeenCalledWith("members");
    expect(mocks.membersQuery.select).toHaveBeenCalledWith("id, member_code");
    expect(mocks.membersQuery.eq).toHaveBeenCalledWith("status", "active");
    expect(mocks.feePaymentsTable.insert).toHaveBeenCalledWith([
      {
        member_id: "member-1",
        period_month: "2026-07-01",
        amount: 30000,
        paid_date: "2026-07-03",
        memo: "7월 회비",
        created_by: "operator-id",
        updated_by: "operator-id",
      },
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/fees");
  });

  it("redirects a missing member with the original CSV line after blank rows", async () => {
    mocks.membersQuery.eq.mockResolvedValueOnce({ data: [], error: null });
    const formData = new FormData();
    formData.set(
      "csvFile",
      new File(
        [
          [
            "memberCode,periodMonth,amount,paidDate,memo",
            "",
            "m0001,2026-07,30000,2026-07-03,7월 회비",
          ].join("\r\n"),
        ],
        "fees.csv",
        { type: "text/csv" },
      ),
    );

    await expect(importFeePaymentsCsv(formData)).rejects.toThrow(
      "redirect:/fees/new?importError=member-not-found&line=3",
    );
    expect(mocks.feePaymentsTable.insert).not.toHaveBeenCalled();
  });

  it("redirects a missing member with the physical line after a multiline cell", async () => {
    const formData = new FormData();
    formData.set(
      "csvFile",
      new File(
        [
          [
            "memberCode,periodMonth,amount,paidDate,memo",
            'm0001,2026-07,30000,2026-07-03,"첫 줄',
            '둘째 줄"',
            "",
            "m9999,2026-07,30000,2026-07-04,없는 회원",
          ].join("\r\n"),
        ],
        "fees.csv",
        { type: "text/csv" },
      ),
    );

    await expect(importFeePaymentsCsv(formData)).rejects.toThrow(
      "redirect:/fees/new?importError=member-not-found&line=5",
    );
    expect(mocks.feePaymentsTable.insert).not.toHaveBeenCalled();
  });
});
