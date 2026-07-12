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
import { formatMemberStatus } from "./member-list";
import type { MemberEditRecord, MemberGroupOption } from "./member-directory";
import type { DuplicateConfirmation } from "./member-form";
import styles from "./MemberForm.module.scss";

type MemberFormProps = {
  action: (formData: FormData) => void;
  mode: "create" | "edit";
  member?: MemberEditRecord;
  groups: MemberGroupOption[];
  duplicateConfirmation?: DuplicateConfirmation;
};

export function MemberForm({
  action,
  mode,
  member,
  groups,
  duplicateConfirmation = null,
}: MemberFormProps) {
  const duplicateMessage = duplicateConfirmation === "phone-reuse"
    ? "같은 연락처가 다른 이름으로 등록되어 있습니다."
    : duplicateConfirmation === "name-without-phone"
      ? "같은 이름이며 연락처가 없습니다."
      : null;

  return (
    <form action={action} className={styles["member-form"]}>
      {member ? <input name="id" type="hidden" value={member.id} /> : null}
      {duplicateConfirmation ? (
        <input name="duplicateConfirmation" type="hidden" value={duplicateConfirmation} />
      ) : null}

      <p className={styles["member-code-note"]}>
        {member ? <>회원번호 <strong>{member.memberCode}</strong></> : "회원번호는 등록 시 자동 발급됩니다."}
      </p>

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
        {mode === "create" || member?.canManageContacts ? (
          <FormField label="연락처">
            <TextInput
              autoComplete="tel"
              defaultValue={member?.phoneNumber ?? ""}
              inputMode="tel"
              maxLength={13}
              name="phoneNumber"
              placeholder="010-1234-5678"
              type="tel"
            />
          </FormField>
        ) : (
          <div className={styles["protected-contact"]}>
            <span>연락처</span>
            <strong>{member?.phoneDisplay}</strong>
          </div>
        )}
        <FormField label="그룹">
          <SelectInput defaultValue={member?.groupId ?? ""} name="groupId">
            <option value="">그룹 없음</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.code}</option>)}
          </SelectInput>
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
      </FormGrid>

      {duplicateMessage ? (
        <div className={styles["duplicate-warning"]} role="alert">{duplicateMessage}</div>
      ) : null}

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
          {duplicateConfirmation ? "확인 후 등록" : mode === "create" ? "회원 등록" : "변경 저장"}
        </Button>
      </FormActions>
    </form>
  );
}

export type MemberFormStatus = MemberStatus;
