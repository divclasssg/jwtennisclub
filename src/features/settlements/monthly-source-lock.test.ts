import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(
    async (): Promise<{ data: unknown; error: unknown }> => ({
      data: true,
      error: null,
    }),
  ),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));

import {
  getMonthlySourceLockStatus,
  isMonthlySourceLockError,
} from "./monthly-source-lock";

describe("monthly source lock", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });

  it("returns the authenticated lock status for a period month", async () => {
    expect(await getMonthlySourceLockStatus("2026-07-01")).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "get_monthly_source_lock_status",
      { requested_period_month: "2026-07-01" },
    );
  });

  it("recognizes only the database final-source lock error", () => {
    expect(isMonthlySourceLockError({
      code: "55000",
      message: "monthly closing source is locked",
    })).toBe(true);
    expect(isMonthlySourceLockError({
      code: "55000",
      message: "another object state error",
    })).toBe(false);
  });

  it("fails closed when the status RPC does not return a boolean", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });

    await expect(
      getMonthlySourceLockStatus("2026-07-01"),
    ).rejects.toThrow("월별 결산 잠금 상태를 확인하지 못했습니다.");
  });
});
