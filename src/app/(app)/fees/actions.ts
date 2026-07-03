"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  parseFeePaymentsCsv,
  parseFeePaymentFormData,
  toFeePaymentDatabaseInput,
  validateFeePaymentForm,
} from "@/features/fees/fee-form";
import {
  getCurrentPeriodMonth,
  normalizePeriodMonth,
} from "@/features/fees/fee-model";

const feesPath = "/fees";
const feeCreatePath = "/fees/new";
const maximumCsvRows = 200;

type FeeImportMemberRow = {
  id: string;
  name: string;
  phone_last_four: string | null;
};

function buildRedirect(path: string, params: Record<string, string | number>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value));
  }

  return `${path}?${searchParams.toString()}`;
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
    .select("id, name, phone_last_four")
    .eq("status", "active");

  if (membersError) {
    redirect(buildRedirect(feeCreatePath, { importError: "member-load-failed" }));
  }

  const memberMap = buildMemberImportMap(members ?? []);
  const payments = parsed.payments.map((payment, index) => {
    const memberId = memberMap.get(buildMemberImportKey(payment));

    if (!memberId) {
      redirect(
        buildRedirect(feeCreatePath, {
          importError: "member-not-found",
          line: index + 2,
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
    members.map((member) => [
      buildMemberImportKey({
        name: member.name,
        phoneLastFour: member.phone_last_four ?? "",
      }),
      member.id,
    ]),
  );
}

function buildMemberImportKey(input: { name: string; phoneLastFour: string }) {
  return `${input.name.trim()}|${input.phoneLastFour.trim()}`;
}
