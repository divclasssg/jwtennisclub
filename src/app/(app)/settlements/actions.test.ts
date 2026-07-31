import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const supabase = {
    rpc: vi.fn(async () => ({ error: null as { message: string } | null })),
  };

  return {
    revalidatePath: vi.fn(),
    redirect: vi.fn((path: string) => {
      throw new Error(`redirect:${path}`);
    }),
    supabase,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mocks.supabase),
}));

import {
  closeMonthlySettlement,
  createInterimMonthlySettlement,
  reopenMonthlySettlement,
} from "./actions";

describe("monthly settlement actions", () => {
  beforeEach(() => {
    mocks.revalidatePath.mockClear();
    mocks.redirect.mockClear();
    mocks.supabase.rpc.mockReset();
    mocks.supabase.rpc.mockResolvedValue({ error: null });
  });

  it("normalizes the selected month and creates an interim closing", async () => {
    const formData = new FormData();
    formData.set("month", "2026-07-24");

    await expect(createInterimMonthlySettlement(formData)).rejects.toThrow(
      "redirect:/settlements?month=2026-07&status=interim-created",
    );

    expect(mocks.supabase.rpc).toHaveBeenCalledWith(
      "create_interim_monthly_settlement",
      { requested_period_month: "2026-07-01" },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settlements");
    expect(mocks.revalidatePath.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.redirect.mock.invocationCallOrder[0],
    );
  });

  it("preserves category sorting in the final-close-specific success redirect", async () => {
    const formData = new FormData();
    formData.set("month", "2026-07");
    formData.set("sort", "amount");
    formData.set("direction", "desc");

    await expect(closeMonthlySettlement(formData)).rejects.toThrow(
      "redirect:/settlements?month=2026-07&sort=amount&direction=desc&status=final-closed",
    );

    expect(mocks.supabase.rpc).toHaveBeenCalledWith("close_monthly_settlement", {
      requested_period_month: "2026-07-01",
    });
  });

  it("uses the reopen RPC with a final-reopen-specific success redirect", async () => {
    const formData = new FormData();
    formData.set("month", "2026-07");

    await expect(reopenMonthlySettlement(formData)).rejects.toThrow(
      "redirect:/settlements?month=2026-07&status=final-reopened",
    );

    expect(mocks.supabase.rpc).toHaveBeenCalledWith("reopen_monthly_settlement", {
      requested_period_month: "2026-07-01",
    });
  });

  it("redirects invalid month input without calling an RPC", async () => {
    const formData = new FormData();
    formData.set("month", "2026-19");

    await expect(closeMonthlySettlement(formData)).rejects.toThrow(
      "redirect:/settlements?error=invalid-month",
    );

    expect(mocks.supabase.rpc).not.toHaveBeenCalled();
  });

  it("maps an RPC failure to a stable query error without database details", async () => {
    mocks.supabase.rpc.mockResolvedValue({
      error: { message: "settlements.close permission required" },
    });
    const formData = new FormData();
    formData.set("month", "2026-07");

    await expect(closeMonthlySettlement(formData)).rejects.toThrow(
      "redirect:/settlements?month=2026-07&error=mutation-failed",
    );
  });
});
