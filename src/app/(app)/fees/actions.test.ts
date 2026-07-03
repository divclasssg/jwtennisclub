import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const deleteQuery = {
    eq: vi.fn(async () => ({ error: null })),
  };
  const feePaymentsTable = {
    delete: vi.fn(() => deleteQuery),
  };
  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "operator-id" } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table !== "fee_payments") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return feePaymentsTable;
    }),
  };

  return {
    deleteQuery,
    feePaymentsTable,
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

import { cancelFeePayment } from "./actions";

describe("fee payment actions", () => {
  beforeEach(() => {
    mocks.redirect.mockClear();
    mocks.revalidatePath.mockClear();
    mocks.supabase.auth.getUser.mockClear();
    mocks.supabase.from.mockClear();
    mocks.feePaymentsTable.delete.mockClear();
    mocks.deleteQuery.eq.mockClear();
    mocks.deleteQuery.eq.mockResolvedValue({ error: null });
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
});
