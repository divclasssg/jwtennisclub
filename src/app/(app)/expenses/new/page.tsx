import {
  NewExpenseContent,
  type NewExpenseSearchParams,
} from "./NewExpenseContent";
import { FormPageTemplate } from "@/components/templates";
import {
  getCurrentPeriodMonth,
  normalizePeriodMonth,
} from "@/features/expenses/expense-model";
import { getMonthlySourceLockStatus } from "@/features/settlements/monthly-source-lock";

type NewExpensePageProps = {
  searchParams: Promise<
    NewExpenseSearchParams & { month?: string | string[] }
  >;
};

export default async function NewExpensePage({ searchParams }: NewExpensePageProps) {
  const params = await searchParams;
  const requestedMonth = Array.isArray(params.month)
    ? params.month[0]
    : params.month;
  const periodMonth =
    normalizePeriodMonth(requestedMonth) || getCurrentPeriodMonth();
  const isLocked = await getMonthlySourceLockStatus(periodMonth);

  return (
    <FormPageTemplate
      description="운영 중 발생한 지출 내역을 기록합니다."
      kicker="지출 등록"
      title="지출 관리"
    >
      {isLocked ? (
        <p role="status">
          최종 마감된 월입니다. 회비와 지출을 수정하려면 먼저 결산을
          재개하세요.
        </p>
      ) : (
        <NewExpenseContent searchParams={params} />
      )}
    </FormPageTemplate>
  );
}
