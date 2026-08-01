import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { loadDashboardPage } from "./dashboard-data";

function validDatabasePage() {
  return {
    as_of: "2026-08-01T00:00:00.000Z",
    period_month: "2026-08-01",
    members: {
      active_count: 20,
      upcoming_count: 2,
      paused_count: 1,
      joined_this_month_count: 1,
      paused_this_month_count: 0,
      withdrawn_this_month_count: 0,
    },
    current_finance: {
      status: "available",
      blocked_reason: null,
      source: "current",
      summary: {
        billed_total: 600000,
        actual_fee_income: 510000,
        expense_total: 130000,
        attributed_net: 380000,
        fully_paid_count: 17,
        fee_target_count: 20,
        unpaid_count: 3,
        unpaid_total: 90000,
        opening_ledger_balance: 395000,
        closing_ledger_balance: 775000,
      },
      active_final: null,
      latest_interim: null,
    },
    latest_final: null,
    trends: [{
      period_month: "2026-08-01",
      source: "current",
      actual_fee_income: 510000,
      expense_total: 130000,
      closing_ledger_balance: 775000,
    }],
  };
}

describe("dashboard data loader", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  it("loads and parses the dashboard through its single aggregate RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: validDatabasePage(), error: null });

    const result = await loadDashboardPage();

    expect(mocks.rpc).toHaveBeenCalledWith("get_dashboard_page");
    expect(result.periodMonth).toBe("2026-08-01");
  });

  it("uses a controlled error when the aggregate RPC fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "database error" } });

    await expect(loadDashboardPage()).rejects.toThrow(
      "대시보드 정보를 불러오지 못했습니다.",
    );
  });

  it("preserves the parser's controlled error for malformed aggregate data", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ...validDatabasePage(), period_month: "2026-08-02" },
      error: null,
    });

    await expect(loadDashboardPage()).rejects.toThrow(
      "대시보드 데이터 형식이 올바르지 않습니다.",
    );
  });
});
