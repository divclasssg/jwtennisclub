import Link from "next/link";
import { DEFAULT_MONTHLY_FEE_AMOUNT } from "./fee-model";
import styles from "./FeePaymentForm.module.scss";

type FeePaymentMemberOption = {
  id: string;
  name: string;
  phoneLastFour: string | null;
};

type FeePaymentFormProps = {
  action: (formData: FormData) => void;
  members: FeePaymentMemberOption[];
  defaultPeriodMonth: string;
  defaultPaidDate: string;
};

export function FeePaymentForm({
  action,
  members,
  defaultPeriodMonth,
  defaultPaidDate,
}: FeePaymentFormProps) {
  return (
    <form action={action} className={styles["fee-payment-form"]}>
      <div className={styles["fee-payment-form-grid"]}>
        <label>
          회원
          <select name="memberId" required>
            <option value="">회원 선택</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
                {member.phoneLastFour ? ` (${member.phoneLastFour})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          납부 월
          <input
            defaultValue={defaultPeriodMonth.slice(0, 7)}
            name="periodMonth"
            required
            type="month"
          />
        </label>
        <label>
          납부 금액
          <input
            defaultValue={DEFAULT_MONTHLY_FEE_AMOUNT}
            inputMode="numeric"
            min={1}
            name="amount"
            required
            step={1}
            type="number"
          />
        </label>
        <label>
          납부일
          <input
            defaultValue={defaultPaidDate}
            name="paidDate"
            required
            type="date"
          />
        </label>
      </div>

      <label>
        메모
        <textarea maxLength={500} name="memo" rows={4} />
      </label>

      <div className={styles["fee-payment-form-actions"]}>
        <Link href="/fees">취소</Link>
        <button type="submit">납부 등록</button>
      </div>
    </form>
  );
}
