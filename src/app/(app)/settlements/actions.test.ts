import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const supabase = {
    rpc: vi.fn(async () => ({ error: null as { message: string } | null })),
  };
  const createClient = vi.fn(async () => supabase);

  return {
    createClient,
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
  createClient: mocks.createClient,
}));

import {
  closeMonthlySettlement,
  createInterimMonthlySettlement,
  reopenMonthlySettlement,
} from "./actions";

describe("monthly settlement actions", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.createClient.mockResolvedValue(mocks.supabase);
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

  it.each([
    ["an unknown sort key", "drop table", "desc"],
    ["an unknown direction", "amount", "sideways"],
    ["a sort key without a direction", "amount", ""],
    ["a direction without a sort key", "", "desc"],
  ])("drops %s instead of reflecting noisy FormData", async (_case, sort, direction) => {
    const formData = new FormData();
    formData.set("month", "2026-07");
    if (sort) formData.set("sort", sort);
    if (direction) formData.set("direction", direction);

    await expect(closeMonthlySettlement(formData)).rejects.toThrow(
      "redirect:/settlements?month=2026-07&status=final-closed",
    );
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

  it.each([
    [
      "client creation",
      () => mocks.createClient.mockRejectedValueOnce(new Error("client failed")),
    ],
    [
      "RPC invocation",
      () => mocks.supabase.rpc.mockRejectedValueOnce(new Error("rpc failed")),
    ],
  ])(
    "maps rejected %s to a stable failure redirect outside the catch",
    async (_source, rejectMutation) => {
      rejectMutation();
      const formData = new FormData();
      formData.set("month", "2026-07");
      formData.set("sort", "amount");
      formData.set("direction", "desc");

      await expect(closeMonthlySettlement(formData)).rejects.toThrow(
        "redirect:/settlements?month=2026-07&sort=amount&direction=desc&error=mutation-failed",
      );

      expect(mocks.redirect).toHaveBeenCalledTimes(1);
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );
});
