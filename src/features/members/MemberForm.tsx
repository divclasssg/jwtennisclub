"use client";

import { useActionState } from "react";
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
import {
  initialMemberActionState,
  type DuplicateConfirmation,
  type MemberActionState,
} from "./member-form";
import styles from "./MemberForm.module.scss";

type MemberFormProps = {
  action: (state: MemberActionState, formData: FormData) => Promise<MemberActionState>;
  mode: "create" | "edit";
  member?: MemberEditRecord;
  groups: MemberGroupOption[];
  duplicateConfirmation?: DuplicateConfirmation;
  canManageContacts?: boolean;
};

export function MemberForm({
  action,
  mode,
  member,
  groups,
  duplicateConfirmation = null,
  canManageContacts = member?.canManageContacts ?? false,
}: MemberFormProps) {
  const [actionState, formAction] = useActionState(action, initialMemberActionState);
  const activeConfirmation = actionState.status === "confirmation-required"
    ? actionState.reason
    : duplicateConfirmation;
  const candidate = actionState.status === "confirmation-required"
    ? actionState.candidate
    : null;
  const duplicateMessage = activeConfirmation === "phone-reuse"
    ? "같은 연락처가 다른 이름으로 등록되어 있습니다."
    : activeConfirmation === "name-without-phone"
      ? "같은 이름이며 연락처가 없습니다."
      : null;

  return (
    <form
      action={formAction}
      className={styles["member-form"]}
      key={activeConfirmation ?? "editing"}
    >
      {member ? <input name="id" type="hidden" value={member.id} /> : null}
      {activeConfirmation ? (
        <input name="duplicateConfirmation" type="hidden" value={activeConfirmation} />
      ) : null}

      <p className={styles["member-code-note"]}>
        {member ? <>회원번호 <strong>{member.memberCode}</strong></> : "회원번호는 등록 시 자동 발급됩니다."}
      </p>

      <FormGrid>
        <FormField label="이름" labelVisible>
          <TextInput
            defaultValue={candidate?.name ?? member?.name}
            maxLength={50}
            name="name"
            placeholder="홍길동"
            required
            type="text"
          />
        </FormField>
        {canManageContacts ? (
          <FormField label="연락처" labelVisible>
            <TextInput
              autoComplete="tel"
              defaultValue={candidate?.phoneNumber ?? member?.phoneNumber ?? ""}
              inputMode="tel"
              maxLength={13}
              name="phoneNumber"
              placeholder="010-1234-5678"
              type="tel"
            />
          </FormField>
        ) : mode === "edit" ? (
          <div className={styles["protected-contact"]}>
            <span>연락처</span>
            <strong>{member?.phoneDisplay}</strong>
          </div>
        ) : null}
        <FormField label="그룹" labelVisible>
          <SelectInput defaultValue={candidate?.groupId ?? member?.groupId ?? ""} name="groupId">
            <option value="">그룹 없음</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.code}</option>)}
          </SelectInput>
        </FormField>
        <FormField label="가입일" labelVisible>
          <DateInput
            defaultValue={candidate?.joinedDate ?? member?.joinedDate}
            name="joinedDate"
            required
          />
        </FormField>
        <div>
          <FormField label="활동 시작 월" labelVisible>
            <TextInput
              aria-describedby="activity-start-month-help"
              defaultValue={(candidate?.activityStartMonth ?? member?.activityStartMonth ?? "").slice(0, 7)}
              min={(candidate?.joinedDate ?? member?.joinedDate ?? "").slice(0, 7)}
              name="activityStartMonth"
              required
              type="month"
            />
          </FormField>
          <small id="activity-start-month-help">가입 월 또는 그 이후의 월을 선택하세요.</small>
        </div>
        <FormField label="상태" labelVisible>
          <SelectInput defaultValue={candidate?.status ?? member?.status ?? "active"} name="status">
            {MEMBER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {formatMemberStatus(status)}
              </option>
            ))}
          </SelectInput>
        </FormField>
        <div>
          <FormField label="휴회 시작 월" labelVisible>
            <TextInput
              aria-describedby="pause-start-month-help"
              defaultValue={(candidate?.pauseStartMonth ?? member?.pauseStartMonth ?? "").slice(0, 7)}
              name="pauseStartMonth"
              type="month"
            />
          </FormField>
          <small id="pause-start-month-help">선택한 월부터 회원은 회비 대상에서 제외됩니다.</small>
        </div>
        <FormField label="탈퇴일" labelVisible>
          <DateInput
            defaultValue={candidate?.withdrawnDate ?? member?.withdrawnDate ?? ""}
            name="withdrawnDate"
          />
        </FormField>
      </FormGrid>

      {duplicateMessage ? (
        <div className={styles["duplicate-warning"]} role="alert">{duplicateMessage}</div>
      ) : null}

      <FormField label="메모" labelVisible>
        <TextArea
          defaultValue={candidate?.memo ?? member?.memo ?? ""}
          maxLength={500}
          name="memo"
          placeholder="특이사항을 입력하세요"
          rows={4}
        />
      </FormField>

      <FormActions>
        <ActionLink href="/members" variant="secondary">
          취소
        </ActionLink>
        <Button type="submit">
          {activeConfirmation ? "확인 후 등록" : mode === "create" ? "회원 등록" : "변경 저장"}
        </Button>
      </FormActions>
    </form>
  );
}

export type MemberFormStatus = MemberStatus;
