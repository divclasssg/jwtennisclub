import {
  NewExpenseContent,
  type NewExpenseSearchParams,
} from "../../../expenses/new/NewExpenseContent";
import { ModalDialog } from "@/components/molecules";
import {
  getCurrentPeriodMonth,
  normalizePeriodMonth,
} from "@/features/expenses/expense-model";
import { getMonthlySourceLockStatus } from "@/features/settlements/monthly-source-lock";

type NewExpenseModalPageProps = {
  searchParams: Promise<NewExpenseSearchParams>;
};

export default async function NewExpenseModalPage({
  searchParams,
}: NewExpenseModalPageProps) {
  const params = await searchParams;
  const requestedMonth = Array.isArray(params.month)
    ? params.month[0]
    : params.month;
  const periodMonth =
    normalizePeriodMonth(requestedMonth) || getCurrentPeriodMonth();
  const isLocked = await getMonthlySourceLockStatus(periodMonth);

  return (
    <ModalDialog title="지출 등록">
      {isLocked ? (
        <p role="status">
          최종 마감된 월입니다. 회비와 지출을 수정하려면 먼저 결산을
          재개하세요.
        </p>
      ) : (
        <NewExpenseContent searchParams={params} />
      )}
    </ModalDialog>
  );
}
