import { redirect } from "next/navigation";
import {
  normalizeReportFilters,
  type ReportSearchParams,
} from "@/features/reports/monthly-report";

type ReportsPageProps = {
  searchParams: Promise<ReportSearchParams>;
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const filters = normalizeReportFilters(await searchParams);
  const monthValue = filters.periodMonth.slice(0, 7);

  redirect(`/settlements?month=${monthValue}`);
}
