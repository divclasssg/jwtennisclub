import type { ComponentProps } from "react";
import { ActionLink, Button } from "@/components/atoms";
import { RowActions } from "@/components/molecules";
import type { ExpenseRecord } from "./expense-model";
import { formatCurrency, formatExpenseCategory } from "./expense-list";
import styles from "./ExpenseMobileList.module.scss";

type ExpenseMobileListProps = {
  deleteAction: NonNullable<ComponentProps<"form">["action"]>;
  expenses: ExpenseRecord[];
  isLocked?: boolean;
};

export function ExpenseMobileList({
  expenses,
  deleteAction,
  isLocked = false,
}: ExpenseMobileListProps) {
  return (
    <ul aria-label="모바일 지출 목록" className={styles["expense-mobile-list"]}>
      {expenses.map((expense) => (
        <li className={styles["expense-mobile-item"]} key={expense.id}>
          <div className={styles["expense-mobile-header"]}>
            <h3 className={styles["expense-mobile-name"]}>
              {expense.description}
            </h3>
            <strong className={styles["expense-mobile-amount"]}>
              {formatCurrency(expense.amount)}원
            </strong>
          </div>
          <div className={styles["expense-mobile-meta"]}>
            <span>{expense.expenseDate.replaceAll("-", ".")}</span>
            <span>{formatExpenseCategory(expense.category)}</span>
          </div>
          <div className={styles["expense-mobile-actions"]}>
            <div className={styles["expense-mobile-receipt"]}>
              {expense.receiptFileKey ? (
                <a
                  href={`/expenses/receipts?key=${encodeURIComponent(expense.receiptFileKey)}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  영수증 보기
                </a>
              ) : expense.hasReceipt ? (
                "증빙 있음"
              ) : (
                "증빙 없음"
              )}
            </div>
            {isLocked ? null : (
              <RowActions>
                <ActionLink
                  href={`/expenses/${expense.id}/edit`}
                  size="compact"
                  variant="secondary"
                >
                  수정
                </ActionLink>
                <form action={deleteAction}>
                  <input name="expenseId" type="hidden" value={expense.id} />
                  <Button size="compact" type="submit" variant="danger">
                    삭제
                  </Button>
                </form>
              </RowActions>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
