import { ActionLink, Button } from "@/components/atoms";
import { FormActions, FormField, FormGrid } from "@/components/molecules";
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

      <FormGrid>
        <FormField label="사용일">
          <input
            defaultValue={expense?.expenseDate ?? defaultExpenseDate}
            name="expenseDate"
            required
            type="date"
          />
        </FormField>
        <FormField label="카테고리">
          <select defaultValue={expense?.category ?? ""} name="category" required>
            <option value="">카테고리 선택</option>
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {EXPENSE_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="내용">
          <input
            defaultValue={expense?.description}
            maxLength={120}
            name="description"
            required
            type="text"
          />
        </FormField>
        <FormField label="금액">
          <input
            defaultValue={expense?.amount}
            inputMode="numeric"
            min={1}
            name="amount"
            required
            step={1}
            type="number"
          />
        </FormField>
      </FormGrid>

      {expense?.receiptFileName ? (
        <div className={styles["expense-receipt-status"]}>
          <p className={styles["expense-current-receipt"]}>
            현재 영수증: {expense.receiptFileName}
          </p>
          <Button
            formNoValidate
            name="intent"
            size="compact"
            type="submit"
            value="removeReceipt"
            variant="danger"
          >
            영수증 삭제
          </Button>
        </div>
      ) : null}

      <FormField label={mode === "edit" ? "영수증 파일 교체" : "영수증 파일"}>
        <input
          accept="image/jpeg,image/png,image/webp,application/pdf"
          name="receiptFile"
          type="file"
        />
      </FormField>

      <FormField label="메모">
        <textarea
          defaultValue={expense?.memo ?? ""}
          maxLength={500}
          name="memo"
          rows={4}
        />
      </FormField>

      <FormActions>
        <ActionLink href="/expenses" variant="secondary">
          취소
        </ActionLink>
        <Button type="submit">
          {mode === "create" ? "지출 등록" : "변경 저장"}
        </Button>
      </FormActions>
    </form>
  );
}
