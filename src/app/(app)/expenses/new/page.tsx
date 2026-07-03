import { createExpense } from "../actions";
import styles from "./page.module.scss";
import { ExpenseForm } from "@/features/expenses/ExpenseForm";
import { firstSearchParam } from "@/features/members/member-list";

type NewExpensePageProps = {
  searchParams: Promise<{
    error?: string | string[];
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

export default async function NewExpensePage({ searchParams }: NewExpensePageProps) {
  const params = await searchParams;
  const errorMessage = getErrorMessage(firstSearchParam(params.error));

  return (
    <section className={styles["expense-create-page"]}>
      <header className={styles["expense-create-header"]}>
        <div>
          <p className={styles["expense-create-kicker"]}>지출 관리</p>
          <h1>지출 등록</h1>
        </div>
        <p>운영 중 발생한 지출 내역을 기록합니다.</p>
      </header>

      <section className={styles["expense-create-panel"]}>
        <div className={styles["expense-section-header"]}>
          <h2>지출 정보</h2>
          <p>사용일, 카테고리, 내용, 금액과 영수증 파일을 입력하세요.</p>
        </div>
        <ExpenseForm
          action={createExpense}
          defaultExpenseDate={getTodayInputValue()}
        />
        {errorMessage ? (
          <p className={styles["expense-form-error"]}>{errorMessage}</p>
        ) : null}
      </section>
    </section>
  );
}
