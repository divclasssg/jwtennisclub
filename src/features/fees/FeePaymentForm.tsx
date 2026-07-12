import { ActionLink, Button } from "@/components/atoms";
import { FormActions, FormField, FormGrid } from "@/components/molecules";
import { DEFAULT_MONTHLY_FEE_AMOUNT } from "./fee-model";
import styles from "./FeePaymentForm.module.scss";

type FeePaymentMemberOption = {
  id: string;
  name: string;
  memberCode: string;
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
      <FormGrid>
        <FormField label="회원">
          <select name="memberId" required>
            <option value="">회원 선택</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
                {` (${member.memberCode})`}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="납부 월">
          <input
            defaultValue={defaultPeriodMonth.slice(0, 7)}
            name="periodMonth"
            required
            type="month"
          />
        </FormField>
        <FormField label="납부 금액">
          <input
            defaultValue={DEFAULT_MONTHLY_FEE_AMOUNT}
            inputMode="numeric"
            min={1}
            name="amount"
            required
            step={1}
            type="number"
          />
        </FormField>
        <FormField label="납부일">
          <input
            defaultValue={defaultPaidDate}
            name="paidDate"
            required
            type="date"
          />
        </FormField>
      </FormGrid>

      <FormField label="메모">
        <textarea maxLength={500} name="memo" rows={4} />
      </FormField>

      <FormActions>
        <ActionLink href="/fees" variant="secondary">
          취소
        </ActionLink>
        <Button type="submit">납부 등록</Button>
      </FormActions>
    </form>
  );
}
