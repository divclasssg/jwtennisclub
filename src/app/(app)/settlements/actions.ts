"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizePeriodMonth } from "@/features/fees/fee-model";
import { createClient } from "@/lib/supabase/server";

type SettlementMutationRpc =
  | "create_interim_monthly_settlement"
  | "close_monthly_settlement"
  | "reopen_monthly_settlement";

type SettlementMutationSuccess =
  | "interim-created"
  | "final-closed"
  | "final-reopened";

const SETTLEMENT_SORT_KEYS = new Set(["category", "count", "amount"]);
const SORT_DIRECTIONS = new Set(["asc", "desc"]);

function normalizeSettlementPeriodMonth(value: string) {
  const periodMonth = normalizePeriodMonth(value);
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(periodMonth)) {
    return "";
  }

  const [year, month] = periodMonth.slice(0, 7).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1
    ? periodMonth
    : "";
}

function readFormValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function buildSettlementHref(
  periodMonth: string,
  formData: FormData,
  statusOrError:
    | { status: SettlementMutationSuccess }
    | { error: "mutation-failed" },
) {
  const params = new URLSearchParams({ month: periodMonth.slice(0, 7) });
  const sort = readFormValue(formData, "sort");
  const direction = readFormValue(formData, "direction");

  if (SETTLEMENT_SORT_KEYS.has(sort) && SORT_DIRECTIONS.has(direction)) {
    params.set("sort", sort);
    params.set("direction", direction);
  }

  if ("status" in statusOrError) {
    params.set("status", statusOrError.status);
  } else {
    params.set("error", statusOrError.error);
  }

  return `/settlements?${params.toString()}`;
}

async function runSettlementMutation(
  rpcName: SettlementMutationRpc,
  successStatus: SettlementMutationSuccess,
  formData: FormData,
) {
  const periodMonth = normalizeSettlementPeriodMonth(
    readFormValue(formData, "month"),
  );
  if (!periodMonth) {
    redirect("/settlements?error=invalid-month");
  }

  let mutationFailed = false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc(rpcName, {
      requested_period_month: periodMonth,
    });
    mutationFailed = Boolean(error);
  } catch {
    mutationFailed = true;
  }

  if (mutationFailed) {
    redirect(
      buildSettlementHref(periodMonth, formData, { error: "mutation-failed" }),
    );
  }

  revalidatePath("/settlements");
  redirect(
    buildSettlementHref(periodMonth, formData, { status: successStatus }),
  );
}

export async function createInterimMonthlySettlement(formData: FormData) {
  await runSettlementMutation(
    "create_interim_monthly_settlement",
    "interim-created",
    formData,
  );
}

export async function closeMonthlySettlement(formData: FormData) {
  await runSettlementMutation(
    "close_monthly_settlement",
    "final-closed",
    formData,
  );
}

export async function reopenMonthlySettlement(formData: FormData) {
  await runSettlementMutation(
    "reopen_monthly_settlement",
    "final-reopened",
    formData,
  );
}
