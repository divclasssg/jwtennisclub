import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseMonthlySettlementClosing } from "@/features/settlements/settlement-snapshot";
import {
  buildMonthlyReportData,
  formatReportFileName,
  normalizeReportSnapshotId,
} from "@/features/reports/monthly-report";
import { renderMonthlyReportPdf } from "@/features/reports/MonthlyReportPdf";

type ProfileDatabaseRow = {
  display_name: string | null;
};

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

export async function GET(request: NextRequest) {
  const snapshotValues = request.nextUrl.searchParams.getAll("snapshot");
  const snapshotId = normalizeReportSnapshotId(
    snapshotValues.length === 1 ? snapshotValues[0] : snapshotValues,
  );

  if (!snapshotId) {
    return controlledResponse("결산 스냅샷 식별자가 올바르지 않습니다.", 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let auditedClosingData: unknown;
  try {
    const { data, error } = await supabase.rpc(
      "record_monthly_report_generation",
      { requested_closing_id: snapshotId },
    );

    if (error) {
      if (error.code === "P0002") {
        return controlledResponse("결산 스냅샷을 찾을 수 없습니다.", 404);
      }

      return controlledResponse("PDF 생성 기록을 저장하지 못했습니다.", 500);
    }

    auditedClosingData = data;
  } catch {
    return controlledResponse("PDF 생성 기록을 저장하지 못했습니다.", 500);
  }

  if (!auditedClosingData) {
    return controlledResponse("결산 스냅샷을 찾을 수 없습니다.", 404);
  }

  let closing;
  try {
    closing = parseMonthlySettlementClosing(auditedClosingData);
  } catch {
    return controlledResponse("마감 결산 데이터를 확인하지 못했습니다.", 500);
  }

  if (closing.id !== snapshotId) {
    return controlledResponse("마감 결산 데이터를 확인하지 못했습니다.", 500);
  }

  try {
    const generatedBy = await getGeneratedBy(user);
    const report = buildMonthlyReportData({
      closing,
      generatedAt: new Date(),
      generatedBy,
    });
    const pdf = await renderMonthlyReportPdf(report);

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Disposition": `attachment; filename="${formatReportFileName(
          closing.periodMonth,
          closing.closingKind,
          closing.version,
        )}"`,
        "Content-Type": "application/pdf",
      },
    });
  } catch {
    return controlledResponse("PDF 보고서를 생성하지 못했습니다.", 500);
  }
}
