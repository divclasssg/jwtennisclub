import "server-only";

import { createClient } from "@/lib/supabase/server";
import { parseDashboardPage } from "./dashboard-page";

export async function loadDashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_dashboard_page");

  if (error) {
    throw new Error("대시보드 정보를 불러오지 못했습니다.");
  }

  return parseDashboardPage(data);
}
