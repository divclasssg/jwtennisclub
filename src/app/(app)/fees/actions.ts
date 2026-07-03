"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  parseFeePaymentFormData,
  toFeePaymentDatabaseInput,
  validateFeePaymentForm,
} from "@/features/fees/fee-form";

const feesPath = "/fees";
const feeCreatePath = "/fees/new";

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
