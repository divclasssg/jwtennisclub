import { createMember } from "../actions";
import { FormMessage } from "@/components/molecules";
import { FormPanel } from "@/components/organisms";
import { MemberForm } from "@/features/members/MemberForm";
import type { MemberGroupOption } from "@/features/members/member-directory";
import type { DuplicateConfirmation } from "@/features/members/member-form";
import { firstSearchParam } from "@/features/members/member-list";

export type NewMemberSearchParams = {
  error?: string | string[];
  duplicate?: string | string[];
};

function errorMessage(error?: string) {
  if (error === "invalid-name") return "이름을 입력하세요.";
  if (error === "invalid-phone") return "연락처 형식을 확인하세요.";
  if (error === "invalid-joined-date") return "가입일을 확인하세요.";
  if (error === "invalid-withdrawn-date") return "탈퇴 상태와 탈퇴일을 확인하세요.";
  if (error === "duplicate-member") return "이미 등록된 회원입니다.";
  if (error === "save-failed") return "회원을 저장하지 못했습니다. 권한 또는 입력값을 확인하세요.";
  return null;
}

function duplicateValue(value?: string): DuplicateConfirmation {
  return value === "phone-reuse" || value === "name-without-phone" ? value : null;
}

export function NewMemberContent({ searchParams, groups, canManageContacts }: {
  searchParams: NewMemberSearchParams;
  groups: MemberGroupOption[];
  canManageContacts: boolean;
}) {
  const message = errorMessage(firstSearchParam(searchParams.error));
  const duplicate = duplicateValue(firstSearchParam(searchParams.duplicate));

  return <FormPanel description="이름, 전체 연락처, 그룹과 가입일을 입력합니다." title="회원 정보">
    <MemberForm action={createMember} canManageContacts={canManageContacts} duplicateConfirmation={duplicate} groups={groups} mode="create" />
    {message ? <FormMessage>{message}</FormMessage> : null}
  </FormPanel>;
}
