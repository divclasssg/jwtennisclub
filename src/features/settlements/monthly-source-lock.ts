import { createClient } from "@/lib/supabase/server";

export async function getMonthlySourceLockStatus(periodMonth: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_monthly_source_lock_status",
    { requested_period_month: periodMonth },
  );
  if (error || typeof data !== "boolean") {
    throw new Error("월별 결산 잠금 상태를 확인하지 못했습니다.");
  }
  return data;
}

export function isMonthlySourceLockError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "55000" &&
      "message" in error &&
      String(error.message).includes("monthly closing source is locked"),
  );
}
