"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentOperatorHasPermission } from "@/features/auth/operator-context";
import {
  parseFeePaymentsCsv,
  parseFeePaymentFormData,
  toFeePaymentDatabaseInput,
  validateFeePaymentForm,
} from "@/features/fees/fee-form";
import {
  buildFeesHref,
  normalizeFeeNoteInput,
} from "@/features/fees/fee-note";
import {
  FEE_EXEMPT_MEMBER_CODE,
  getCurrentPeriodMonth,
  getPeriodMonthEnd,
  normalizePeriodMonth,
} from "@/features/fees/fee-model";

const feesPath = "/fees";
const feeCreatePath = "/fees/new";
const maximumCsvRows = 200;

type FeeImportMemberRow = {
  id: string;
  member_code: string;
};

function buildRedirect(path: string, params: Record<string, string | number>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value));
  }

  return `${path}?${searchParams.toString()}`;
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function firstValidationCode(errors: string[]) {
  if (errors.some((error) => error.includes("회원"))) {
    return "invalid-member";
  }

  if (errors.some((error) => error.includes("납부 월"))) {
    return "invalid-period-month";
  }

  if (errors.some((error) => error.includes("금액"))) {
    return "invalid-amount";
  }

  if (errors.some((error) => error.includes("납부일"))) {
    return "invalid-paid-date";
  }

  return "invalid-payment";
}

async function getAuthenticatedUserId() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { supabase, userId: user.id };
}

export async function createFeePayment(formData: FormData) {
  const payment = parseFeePaymentFormData(formData);
  const errors = validateFeePaymentForm(payment);

  if (errors.length > 0) {
    redirect(buildRedirect(feeCreatePath, { error: firstValidationCode(errors) }));
  }

  const { supabase, userId } = await getAuthenticatedUserId();
  const { error } = await supabase.from("fee_payments").insert({
    ...toFeePaymentDatabaseInput(payment),
    created_by: userId,
    updated_by: userId,
  });

  if (error) {
    redirect(buildRedirect(feeCreatePath, { error: "save-failed" }));
  }

  revalidatePath(feesPath);
  redirect(
    buildRedirect(feesPath, {
      status: "created",
      month: payment.periodMonth.slice(0, 7),
    }),
  );
}

export async function cancelFeePayment(formData: FormData) {
  const paymentId = String(formData.get("paymentId") ?? "");
  const periodMonth =
    normalizePeriodMonth(String(formData.get("periodMonth") ?? "")) ||
    getCurrentPeriodMonth();
  const month = periodMonth.slice(0, 7);

  if (!paymentId) {
    redirect(buildRedirect(feesPath, { error: "missing-payment", month }));
  }

  const { supabase } = await getAuthenticatedUserId();
  const { error } = await supabase
    .from("fee_payments")
    .delete()
    .eq("id", paymentId);

  if (error) {
    redirect(buildRedirect(feesPath, { error: "cancel-failed", month }));
  }

  revalidatePath(feesPath);
  redirect(buildRedirect(feesPath, { status: "cancelled", month }));
}

export async function saveFeeMonthlyNote(formData: FormData) {
  const memberId = readFormString(formData, "memberId");
  const rawPeriodMonth = readFormString(formData, "periodMonth");
  const periodMonth = normalizePeriodMonth(rawPeriodMonth);
  const listState = {
    month: rawPeriodMonth,
    q: readFormString(formData, "query"),
    sort: readFormString(formData, "sort"),
    direction: readFormString(formData, "direction"),
  };
  const note = normalizeFeeNoteInput(formData.get("memo"));

  if (!memberId || !periodMonth || !note.ok) {
    redirect(
      buildFeesHref(listState, {
        note: memberId || undefined,
        noteError: note.ok ? "invalid-input" : note.error,
      }),
    );
  }

  const canCreate = await currentOperatorHasPermission("fees.payments.create");
  const canUpdate = canCreate
    ? false
    : await currentOperatorHasPermission("fees.payments.update");

  if (!canCreate && !canUpdate) {
    redirect(
      buildFeesHref(listState, { note: memberId, noteError: "forbidden" }),
    );
  }

  const { supabase, userId } = await getAuthenticatedUserId();
  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id")
    .eq("id", memberId)
    .eq("status", "active")
    .neq("member_code", FEE_EXEMPT_MEMBER_CODE)
    .lte("joined_date", getPeriodMonthEnd(periodMonth))
    .maybeSingle();

  if (memberError || !member) {
    redirect(
      buildFeesHref(listState, {
        note: memberId,
        noteError: "invalid-member",
      }),
    );
  }

  let mutationError: { message?: string } | null = null;

  if (!note.memo) {
    const { error } = await supabase
      .from("fee_monthly_notes")
      .delete()
      .eq("member_id", memberId)
      .eq("period_month", periodMonth);
    mutationError = error;
  } else {
    const { data: existingNote, error: existingNoteError } = await supabase
      .from("fee_monthly_notes")
      .select("id")
      .eq("member_id", memberId)
      .eq("period_month", periodMonth)
      .maybeSingle();

    if (existingNoteError) {
      mutationError = existingNoteError;
    } else if (existingNote) {
      const { error } = await supabase
        .from("fee_monthly_notes")
        .update({
          memo: note.memo,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingNote.id);
      mutationError = error;
    } else {
      const { error } = await supabase.from("fee_monthly_notes").insert({
        member_id: memberId,
        period_month: periodMonth,
        memo: note.memo,
        created_by: userId,
        updated_by: userId,
      });
      mutationError = error;
    }
  }

  if (mutationError) {
    redirect(
      buildFeesHref(listState, {
        note: memberId,
        noteError: "save-failed",
      }),
    );
  }

  revalidatePath(feesPath);
  redirect(buildFeesHref(listState, { status: "note-saved" }));
}

export async function importFeePaymentsCsv(formData: FormData) {
  const file = formData.get("csvFile");

  if (!(file instanceof File) || file.size === 0) {
    redirect(buildRedirect(feeCreatePath, { importError: "missing-file" }));
  }

  const parsed = parseFeePaymentsCsv(await file.text());

  if (!parsed.ok) {
    redirect(
      buildRedirect(feeCreatePath, {
        importError: "invalid-csv",
        line: parsed.line,
      }),
    );
  }

  if (parsed.payments.length > maximumCsvRows) {
    redirect(buildRedirect(feeCreatePath, { importError: "too-many-rows" }));
  }

  const { supabase, userId } = await getAuthenticatedUserId();
  const { data: members, error: membersError } = await supabase
    .from("members")
    .select("id, member_code")
    .eq("status", "active");

  if (membersError) {
    redirect(buildRedirect(feeCreatePath, { importError: "member-load-failed" }));
  }

  const memberMap = buildMemberImportMap(members ?? []);
  const payments = parsed.payments.map((payment, index) => {
    const memberId = memberMap.get(payment.memberCode);

    if (!memberId) {
      redirect(
        buildRedirect(feeCreatePath, {
          importError: "member-not-found",
          line: parsed.sourceLines[index],
        }),
      );
    }

    return {
      member_id: memberId,
      period_month: payment.periodMonth,
      amount: payment.amount,
      paid_date: payment.paidDate,
      memo: payment.memo,
      created_by: userId,
      updated_by: userId,
    };
  });

  const { error } = await supabase.from("fee_payments").insert(payments);

  if (error) {
    redirect(buildRedirect(feeCreatePath, { importError: "save-failed" }));
  }

  revalidatePath(feesPath);
  redirect(
    buildRedirect(feesPath, {
      status: "imported",
      count: payments.length,
      month: parsed.payments[0].periodMonth.slice(0, 7),
    }),
  );
}

function buildMemberImportMap(members: FeeImportMemberRow[]) {
  return new Map(
    members.map((member) => [member.member_code.trim().toUpperCase(), member.id]),
  );
}
