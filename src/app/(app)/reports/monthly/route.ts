import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  canDownloadMonthlyReport,
  parseMonthlySettlementPage,
  type MonthlySettlementClosing,
} from "@/features/settlements/settlement-snapshot";
import {
  buildMonthlyReportData,
  formatReportFileName,
  normalizeReportFilters,
} from "@/features/reports/monthly-report";
import { renderMonthlyReportPdf } from "@/features/reports/MonthlyReportPdf";

type MonthlyClosingDatabaseRow = {
  id: string;
  period_month: string;
  version: number;
  status: "closed";
  snapshot: unknown;
  closed_at: string;
  closed_by_name: string;
};

type ProfileDatabaseRow = {
  display_name: string | null;
};

async function getActiveClosing(
  periodMonth: string,
): Promise<MonthlySettlementClosing | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("monthly_closings")
    .select(
      "id, period_month, version, status, snapshot, closed_at, closed_by_name",
    )
    .eq("period_month", periodMonth)
    .eq("status", "closed")
    .maybeSingle();

  if (error) {
    throw new Error("monthly closing lookup failed");
  }

  if (!data) return null;

  const closing = data as MonthlyClosingDatabaseRow;
  return parseMonthlySettlementPage({
    preview: closing.snapshot,
    active_closing: {
      id: closing.id,
      period_month: closing.period_month,
      version: closing.version,
      status: closing.status,
      snapshot: closing.snapshot,
      closed_at: closing.closed_at,
      closed_by: closing.closed_by_name,
    },
    can_close: false,
    can_reopen: false,
    close_blocked_reason: "already-closed",
  }).activeClosing;
}

async function getGeneratedBy(user: { id: string; email?: string | null }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error("report generator lookup failed");
  }

  const profile = data as ProfileDatabaseRow | null;
  return profile?.display_name ?? user.email ?? "JW Tennis Club";
}

function controlledResponse(message: string, status: number) {
  return new Response(message, { status });
}

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const filters = normalizeReportFilters(params);
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let closing: MonthlySettlementClosing | null;
  try {
    closing = await getActiveClosing(filters.periodMonth);
  } catch {
    return controlledResponse("마감 정산 데이터를 확인하지 못했습니다.", 500);
  }

  if (!closing) {
    return controlledResponse("마감된 월별 정산을 찾을 수 없습니다.", 404);
  }

  if (!canDownloadMonthlyReport(filters.periodMonth, new Date())) {
    return controlledResponse(
      "이 월의 PDF 생성 기간이 아직 시작되지 않았습니다.",
      403,
    );
  }

  try {
    const [generatedBy] = await Promise.all([getGeneratedBy(user)]);
    const report = buildMonthlyReportData({
      closing,
      generatedAt: new Date(),
      generatedBy,
    });
    const pdf = await renderMonthlyReportPdf(report);
    const { error: auditError } = await supabase.rpc(
      "record_monthly_report_generation",
      {
        requested_closing_id: closing.id,
        requested_period_month: closing.periodMonth,
        requested_version: closing.version,
      },
    );

    if (auditError) {
      return controlledResponse("PDF 생성 기록을 저장하지 못했습니다.", 500);
    }

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Disposition": `attachment; filename="${formatReportFileName(closing.periodMonth)}"`,
        "Content-Type": "application/pdf",
      },
    });
  } catch {
    return controlledResponse("PDF 보고서를 생성하지 못했습니다.", 500);
  }
}
