import { notFound } from "next/navigation";
import { updateExpense } from "../../actions";
import { FormMessage } from "@/components/molecules";
import { FormPanel } from "@/components/organisms";
import { FormPageTemplate } from "@/components/templates";
import { ExpenseForm } from "@/features/expenses/ExpenseForm";
import { mapExpenseRow } from "@/features/expenses/expense-list";
import { firstSearchParam } from "@/features/members/member-list";
import { createClient } from "@/lib/supabase/server";
import { getMonthlySourceLockStatus } from "@/features/settlements/monthly-source-lock";

type EditExpensePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string | string[];
    month?: string | string[];
  }>;
};

function getErrorMessage(error: string | undefined) {
  if (error === "invalid-expense-date") {
    return "사용일을 확인하세요.";
  }

  if (error === "invalid-category") {
    return "카테고리를 선택하세요.";
  }

  if (error === "invalid-description") {
    return "내용을 입력하세요.";
  }

  if (error === "invalid-amount") {
    return "금액을 확인하세요.";
  }

  if (error === "invalid-receipt-type") {
    return "영수증 파일은 JPG, PNG, WebP, PDF만 첨부할 수 있습니다.";
  }

  if (error === "receipt-too-large") {
    return "영수증 파일은 10MB 이하로 첨부하세요.";
  }

  if (error === "receipt-upload-failed") {
    return "영수증 파일을 업로드하지 못했습니다. 잠시 후 다시 시도하세요.";
  }

  if (error === "save-failed") {
    return "지출 기록을 저장하지 못했습니다. 권한과 입력값을 확인하세요.";
  }

  if (error === "closing-locked") {
    return "최종 마감된 월입니다. 회비와 지출을 수정하려면 먼저 결산을 재개하세요.";
  }

  return null;
}

async function getExpense(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .select(
      "id, expense_date, category, description, amount, has_receipt, receipt_content_type, receipt_file_key, receipt_file_name, receipt_file_size, memo, created_by, updated_by, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error("지출 정보를 불러오지 못했습니다.");
  }

  return data ? mapExpenseRow(data) : null;
}

export default async function EditExpensePage({
  params,
  searchParams,
}: EditExpensePageProps) {
  const { id } = await params;
  const expense = await getExpense(id);
  const errorMessage = getErrorMessage(
    firstSearchParam((await searchParams).error),
  );

  if (!expense) {
    notFound();
  }

  const isLocked = await getMonthlySourceLockStatus(
    `${expense.expenseDate.slice(0, 7)}-01`,
  );

  return (
    <FormPageTemplate
      description="지출 정보와 영수증 파일을 수정합니다."
      kicker={expense.description}
      title="지출 수정"
    >
      {isLocked ? (
        <p role="status">
          최종 마감된 월입니다. 회비와 지출을 수정하려면 먼저 결산을
          재개하세요.
        </p>
      ) : (
        <FormPanel
          description="새 영수증 파일을 선택하면 기존 파일이 교체됩니다."
          title="지출 정보"
        >
          <ExpenseForm
            action={updateExpense}
            defaultExpenseDate={expense.expenseDate}
            expense={expense}
            mode="edit"
          />
          {errorMessage ? (
            <FormMessage>{errorMessage}</FormMessage>
          ) : null}
        </FormPanel>
      )}
    </FormPageTemplate>
  );
}
