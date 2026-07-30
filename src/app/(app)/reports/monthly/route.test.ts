import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const activeClosing = {
  id: "f0331b6c-99e0-4d6b-ab47-6e0d3ae57c00",
  period_month: "2026-07-01",
  version: 2,
  status: "closed",
  snapshot,
  closed_at: "2026-08-02T03:04:05.000Z",
  closed_by_name: "김마감",
};

const mocks = vi.hoisted(() => {
  let closingResult: { data: unknown; error: { message: string } | null } = {
    data: null,
    error: null,
  };
  let generationAuditResult: { error: { message: string } | null } = {
    error: null,
  };
  let authenticated = true;

  const closingsQuery = {
    eq: vi.fn(() => closingsQuery),
    maybeSingle: vi.fn(() => Promise.resolve(closingResult)),
    select: vi.fn(() => closingsQuery),
  };
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
      if (table === "monthly_closings") return closingsQuery;
      if (table === "profiles") return profilesQuery;
      throw new Error(`Unexpected raw source table: ${table}`);
    }),
    rpc: vi.fn((functionName: string) => {
      if (functionName === "record_monthly_report_generation") {
        return Promise.resolve({ data: true, ...generationAuditResult });
      }

      throw new Error(`Unexpected RPC: ${functionName}`);
    }),
  };

  return {
    closingsQuery,
    renderMonthlyReportPdf: vi.fn(() =>
      Promise.resolve(Buffer.from("%PDF monthly report")),
    ),
    setGenerationAuditResult(result: { error: { message: string } | null }) {
      generationAuditResult = result;
    },
    setAuthenticated(value: boolean) {
      authenticated = value;
    },
    setClosingResult(result: { data: unknown; error: { message: string } | null }) {
      closingResult = result;
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
    vi.setSystemTime(new Date("2026-08-03T12:00:00Z"));
    vi.clearAllMocks();
    mocks.setAuthenticated(true);
    mocks.setGenerationAuditResult({ error: null });
    mocks.setClosingResult({ data: activeClosing, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders an active stored closing, atomically verifies and audits it, then returns the stable filename", async () => {
    const response = await GET(
      new Request("http://localhost/reports/monthly?month=2026-07"),
    );

    expect(mocks.supabase.from).toHaveBeenCalledWith("monthly_closings");
    expect(mocks.closingsQuery.eq).toHaveBeenNthCalledWith(
      1,
      "period_month",
      "2026-07-01",
    );
    expect(mocks.closingsQuery.eq).toHaveBeenNthCalledWith(2, "status", "closed");
    expect(mocks.renderMonthlyReportPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        closingVersion: 2,
        closedBy: "김마감",
        actualFeeIncome: 525000,
        closingLedgerBalance: 395000,
      }),
    );
    expect(mocks.supabase.rpc).toHaveBeenCalledWith(
      "record_monthly_report_generation",
      {
        requested_closing_id: activeClosing.id,
        requested_period_month: "2026-07-01",
        requested_version: 2,
      },
    );
    expect(mocks.supabase.from).not.toHaveBeenCalledWith("audit_logs");
    expect(mocks.supabase.from).not.toHaveBeenCalledWith("fee_payments");
    expect(mocks.supabase.from).not.toHaveBeenCalledWith("members");
    expect(mocks.supabase.from).not.toHaveBeenCalledWith("expenses");
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(
      "jw-tennis-club-2026-07-report.pdf",
    );
    expect(await response.text()).toBe("%PDF monthly report");
  });

  it("requires an authenticated user", async () => {
    mocks.setAuthenticated(false);

    const response = await GET(
      new Request("http://localhost/reports/monthly?month=2026-07"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login");
    expect(mocks.supabase.from).not.toHaveBeenCalled();
  });

  it("rejects report generation before the next month begins in Seoul", async () => {
    vi.setSystemTime(new Date("2026-07-31T14:59:59.000Z"));

    const response = await GET(
      new Request("http://localhost/reports/monthly?month=2026-07"),
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("이 월의 PDF 생성 기간이 아직 시작되지 않았습니다.");
    expect(mocks.renderMonthlyReportPdf).not.toHaveBeenCalled();
    expect(mocks.supabase.rpc).not.toHaveBeenCalled();
  });

  it("returns a controlled response when no active closing exists", async () => {
    mocks.setClosingResult({ data: null, error: null });

    const response = await GET(
      new Request("http://localhost/reports/monthly?month=2026-07"),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("마감된 월별 정산을 찾을 수 없습니다.");
    expect(mocks.renderMonthlyReportPdf).not.toHaveBeenCalled();
  });

  it("does not return a PDF when the atomic closing verification and audit RPC fails", async () => {
    mocks.setGenerationAuditResult({ error: { message: "closing reopened" } });

    const response = await GET(
      new Request("http://localhost/reports/monthly?month=2026-07"),
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).not.toBe("application/pdf");
    expect(await response.text()).toBe("PDF 생성 기록을 저장하지 못했습니다.");
  });
});
