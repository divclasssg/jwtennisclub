import { createExpense } from "../actions";
import { FormMessage } from "@/components/molecules";
import { FormPanel } from "@/components/organisms";
import { ExpenseForm } from "@/features/expenses/ExpenseForm";
import { firstSearchParam } from "@/features/members/member-list";

export type NewExpenseSearchParams = {
  error?: string | string[];
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

  if (error === "save-failed") {
    return "지출 기록을 저장하지 못했습니다. 권한과 입력값을 확인하세요.";
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

  return null;
}

function getTodayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

type NewExpenseContentProps = {
  searchParams: NewExpenseSearchParams;
};

export function NewExpenseContent({ searchParams }: NewExpenseContentProps) {
  const errorMessage = getErrorMessage(firstSearchParam(searchParams.error));

  return (
    <FormPanel
      description="사용일, 카테고리, 내용, 금액과 영수증 파일을 입력하세요."
      title="지출 정보"
    >
      <ExpenseForm
        action={createExpense}
        defaultExpenseDate={getTodayInputValue()}
      />
      {errorMessage ? <FormMessage>{errorMessage}</FormMessage> : null}
    </FormPanel>
  );
}
