import Link from "next/link";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type ExpenseRecord,
} from "./expense-model";
import styles from "./ExpenseForm.module.scss";

type ExpenseFormProps = {
  action: (formData: FormData) => void;
  defaultExpenseDate: string;
  expense?: ExpenseRecord;
  mode?: "create" | "edit";
};

export function ExpenseForm({
  action,
  defaultExpenseDate,
  expense,
  mode = "create",
}: ExpenseFormProps) {
  return (
    <form action={action} className={styles["expense-form"]}>
      {expense ? <input name="id" type="hidden" value={expense.id} /> : null}

      <div className={styles["expense-form-grid"]}>
        <label>
          사용일
          <input
            defaultValue={expense?.expenseDate ?? defaultExpenseDate}
            name="expenseDate"
            required
            type="date"
          />
        </label>
        <label>
          카테고리
          <select defaultValue={expense?.category ?? ""} name="category" required>
            <option value="">카테고리 선택</option>
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {EXPENSE_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </label>
        <label>
          내용
          <input
            defaultValue={expense?.description}
            maxLength={120}
            name="description"
            required
            type="text"
          />
        </label>
        <label>
          금액
          <input
            defaultValue={expense?.amount}
            inputMode="numeric"
            min={1}
            name="amount"
            required
            step={1}
            type="number"
          />
        </label>
      </div>

      {expense?.receiptFileName ? (
        <div className={styles["expense-receipt-status"]}>
          <p className={styles["expense-current-receipt"]}>
            현재 영수증: {expense.receiptFileName}
          </p>
          <button
            className={styles["expense-receipt-delete-button"]}
            formNoValidate
            name="intent"
            type="submit"
            value="removeReceipt"
          >
            영수증 삭제
          </button>
        </div>
      ) : null}

      <label>
        {mode === "edit" ? "영수증 파일 교체" : "영수증 파일"}
        <input
          accept="image/jpeg,image/png,image/webp,application/pdf"
          name="receiptFile"
          type="file"
        />
      </label>

      <label>
        메모
        <textarea
          defaultValue={expense?.memo ?? ""}
          maxLength={500}
          name="memo"
          rows={4}
        />
      </label>

      <div className={styles["expense-form-actions"]}>
        <Link href="/expenses">취소</Link>
        <button type="submit">
          {mode === "create" ? "지출 등록" : "변경 저장"}
        </button>
      </div>
    </form>
  );
}
