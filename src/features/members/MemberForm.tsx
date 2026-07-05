import {
  ActionLink,
  Button,
  DateInput,
  SelectInput,
  TextArea,
  TextInput,
} from "@/components/atoms";
import { FormActions, FormField, FormGrid } from "@/components/molecules";
import { MEMBER_STATUSES, type MemberStatus } from "./member-model";
import { formatMemberStatus, type MemberListRow } from "./member-list";
import styles from "./MemberForm.module.scss";

type MemberFormProps = {
  action: (formData: FormData) => void;
  mode: "create" | "edit";
  member?: MemberListRow;
};

export function MemberForm({ action, mode, member }: MemberFormProps) {
  return (
    <form action={action} className={styles["member-form"]}>
      {member ? <input name="id" type="hidden" value={member.id} /> : null}

      <FormGrid>
        <FormField label="이름">
          <TextInput
            defaultValue={member?.name}
            maxLength={50}
            name="name"
            required
            type="text"
          />
        </FormField>
        <FormField label="전화번호 끝 4자리">
          <TextInput
            defaultValue={member?.phoneLastFour ?? ""}
            inputMode="numeric"
            maxLength={4}
            name="phoneLastFour"
            pattern="[0-9]{4}"
            placeholder="1234"
            type="text"
          />
        </FormField>
        <FormField label="가입일">
          <DateInput
            defaultValue={member?.joinedDate}
            name="joinedDate"
            required
          />
        </FormField>
        <FormField label="상태">
          <SelectInput defaultValue={member?.status ?? "active"} name="status">
            {MEMBER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {formatMemberStatus(status)}
              </option>
            ))}
          </SelectInput>
        </FormField>
        <FormField label="탈퇴일">
          <DateInput
            defaultValue={member?.withdrawnDate ?? ""}
            name="withdrawnDate"
          />
        </FormField>
        <FormField label="탈퇴 사유">
          <TextInput
            defaultValue={member?.withdrawalReason ?? ""}
            maxLength={100}
            name="withdrawalReason"
            type="text"
          />
        </FormField>
      </FormGrid>

      <FormField label="메모">
        <TextArea
          defaultValue={member?.memo ?? ""}
          maxLength={500}
          name="memo"
          rows={4}
        />
      </FormField>

      <FormActions>
        <ActionLink href="/members" variant="secondary">
          취소
        </ActionLink>
        <Button type="submit">
          {mode === "create" ? "회원 등록" : "변경 저장"}
        </Button>
      </FormActions>
    </form>
  );
}

export type MemberFormStatus = MemberStatus;
