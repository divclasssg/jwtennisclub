import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const closingId = "f0331b6c-99e0-4d6b-ab47-6e0d3ae57c00";
const finalClosingId = "a0331b6c-99e0-4d6b-ab47-6e0d3ae57c00";

const snapshot = {
  schema_version: 1,
  period_month: "2026-07-01",
  monthly_fee_amount: 30000,
  activity_member_count: 21,
  fee_target_count: 20,
  fully_paid_count: 17,
  unpaid_count: 3,
  billed_total: 600000,
  actual_fee_income: 525000,
  recognized_paid_total: 510000,
  adjustment_income: 15000,
  unpaid_total: 90000,
  expense_total: 130000,
  expense_count: 2,
  attributed_net: 395000,
  opening_ledger_balance: 0,
  closing_ledger_balance: 395000,
  expense_category_rows: [
    { category: "court", amount: 120000, count: 1 },
    { category: "balls", amount: 10000, count: 1 },
  ],
  expense_rows: [
    {
      expense_date: "2026-07-12",
      category: "court",
      description: "코트 대관",
      amount: 120000,
    },
    {
      expense_date: "2026-07-18",
      category: "balls",
      description: "시합구",
      amount: 10000,
    },
  ],
};

const interimClosing = {
  id: closingId,
  period_month: "2026-07-01",
  closing_kind: "interim",
  version: 1,
  status: "closed",
  snapshot,
  closed_at: "2026-07-31T03:04:05.000Z",
  closed_by: "김마감",
  reopened_at: null,
};

const reopenedFinalClosing = {
  ...interimClosing,
  id: finalClosingId,
  closing_kind: "final",
  version: 2,
  status: "reopened",
  reopened_at: "2026-07-31T04:04:05.000Z",
};

type RpcResult = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

const mocks = vi.hoisted(() => {
  let reportGenerationResult: RpcResult = {
    data: null,
    error: null,
  };
  let authenticated = true;

  const profilesQuery = {
    eq: vi.fn(() => profilesQuery),
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: { display_name: "김생성" }, error: null }),
    ),
    select: vi.fn(() => profilesQuery),
  };
  const supabase = {
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve(
          authenticated
            ? {
                data: {
                  user: { id: "operator-id", email: "operator@example.com" },
                },
                error: null,
              }
            : { data: { user: null }, error: null },
        ),
      ),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") return profilesQuery;
      throw new Error(`Unexpected raw source table: ${table}`);
    }),
    rpc: vi.fn((functionName: string) => {
      if (functionName === "record_monthly_report_generation") {
        return Promise.resolve(reportGenerationResult);
      }

      throw new Error(`Unexpected RPC: ${functionName}`);
    }),
  };

  return {
    rejectReportGeneration(error: Error) {
      supabase.rpc.mockRejectedValueOnce(error);
    },
    renderMonthlyReportPdf: vi.fn(() =>
      Promise.resolve(Buffer.from("%PDF monthly report")),
    ),
    setAuthenticated(value: boolean) {
      authenticated = value;
    },
    setReportGenerationResult(result: RpcResult) {
      reportGenerationResult = result;
    },
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
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T03:05:00.000Z"));
    vi.clearAllMocks();
    mocks.setAuthenticated(true);
    mocks.setReportGenerationResult({ data: interimClosing, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("audits and downloads the exact interim snapshot immediately on the same day", async () => {
    const response = await GET(
      new NextRequest(
        `http://localhost/reports/monthly?snapshot=${closingId}`,
      ),
    );

    expect(mocks.supabase.rpc).toHaveBeenCalledWith(
      "record_monthly_report_generation",
      { requested_closing_id: closingId },
    );
    expect(mocks.renderMonthlyReportPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        closingKind: "interim",
        closingStatus: "closed",
        closingLabel: "중간 결산 v1",
        closedBy: "김마감",
        actualFeeIncome: 525000,
        closingLedgerBalance: 395000,
      }),
    );
    expect(mocks.supabase.from).not.toHaveBeenCalledWith("monthly_closings");
    expect(mocks.supabase.from).not.toHaveBeenCalledWith("audit_logs");
    expect(mocks.supabase.from).not.toHaveBeenCalledWith("fee_payments");
    expect(mocks.supabase.from).not.toHaveBeenCalledWith("members");
    expect(mocks.supabase.from).not.toHaveBeenCalledWith("expenses");
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(
      "jw-tennis-club-2026-07-interim-v1.pdf",
    );
    expect(await response.text()).toBe("%PDF monthly report");
  });

  it("returns a filename identifying the exact reopened final snapshot", async () => {
    mocks.setReportGenerationResult({
      data: reopenedFinalClosing,
      error: null,
    });

    const response = await GET(
      new NextRequest(
        `http://localhost/reports/monthly?snapshot=${finalClosingId}`,
      ),
    );

    expect(response.headers.get("content-disposition")).toContain(
      "jw-tennis-club-2026-07-final-v2.pdf",
    );
    expect(mocks.renderMonthlyReportPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        closingLabel: "최종 마감 v2 · 재개됨",
      }),
    );
  });

  it("requires an authenticated user", async () => {
    mocks.setAuthenticated(false);

    const response = await GET(
      new NextRequest(
        `http://localhost/reports/monthly?snapshot=${closingId}`,
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login");
    expect(mocks.supabase.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing snapshot", "http://localhost/reports/monthly"],
    ["a blank snapshot", "http://localhost/reports/monthly?snapshot="],
    [
      "duplicate snapshots",
      `http://localhost/reports/monthly?snapshot=${closingId}&snapshot=${finalClosingId}`,
    ],
    [
      "an invalid snapshot",
      "http://localhost/reports/monthly?snapshot=not-a-uuid",
    ],
  ])("returns 400 for %s", async (_, url) => {
    const response = await GET(new NextRequest(url));

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("결산 스냅샷 식별자가 올바르지 않습니다.");
    expect(mocks.supabase.rpc).not.toHaveBeenCalled();
    expect(mocks.renderMonthlyReportPdf).not.toHaveBeenCalled();
  });

  it("returns 404 when the exact snapshot no longer exists", async () => {
    mocks.setReportGenerationResult({
      data: null,
      error: { code: "P0002", message: "monthly settlement closing not found" },
    });

    const response = await GET(
      new NextRequest(
        `http://localhost/reports/monthly?snapshot=${closingId}`,
      ),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("결산 스냅샷을 찾을 수 없습니다.");
    expect(mocks.renderMonthlyReportPdf).not.toHaveBeenCalled();
  });

  it("returns a controlled 500 when the atomic audit fails", async () => {
    mocks.setReportGenerationResult({
      data: null,
      error: { code: "42501", message: "raw database permission failure" },
    });

    const response = await GET(
      new NextRequest(
        `http://localhost/reports/monthly?snapshot=${closingId}`,
      ),
    );

    expect(response.status).toBe(500);
    const responseText = await response.text();
    expect(responseText).toBe("PDF 생성 기록을 저장하지 못했습니다.");
    expect(responseText).not.toContain("raw database permission failure");
    expect(mocks.renderMonthlyReportPdf).not.toHaveBeenCalled();
  });

  it("keeps a rejected audit request private", async () => {
    mocks.rejectReportGeneration(new Error("raw transport failure"));

    const response = await GET(
      new NextRequest(
        `http://localhost/reports/monthly?snapshot=${closingId}`,
      ),
    );

    expect(response.status).toBe(500);
    const responseText = await response.text();
    expect(responseText).toBe("PDF 생성 기록을 저장하지 못했습니다.");
    expect(responseText).not.toContain("raw transport failure");
    expect(mocks.renderMonthlyReportPdf).not.toHaveBeenCalled();
  });

  it("returns a controlled 500 when the audited closing DTO is malformed", async () => {
    mocks.setReportGenerationResult({
      data: { ...interimClosing, closing_kind: "draft" },
      error: null,
    });

    const response = await GET(
      new NextRequest(
        `http://localhost/reports/monthly?snapshot=${closingId}`,
      ),
    );

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("마감 결산 데이터를 확인하지 못했습니다.");
    expect(mocks.renderMonthlyReportPdf).not.toHaveBeenCalled();
  });

  it("rejects an audited DTO whose UUID does not match the requested snapshot", async () => {
    mocks.setReportGenerationResult({
      data: reopenedFinalClosing,
      error: null,
    });

    const response = await GET(
      new NextRequest(
        `http://localhost/reports/monthly?snapshot=${closingId}`,
      ),
    );

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("마감 결산 데이터를 확인하지 못했습니다.");
    expect(mocks.renderMonthlyReportPdf).not.toHaveBeenCalled();
  });
});
