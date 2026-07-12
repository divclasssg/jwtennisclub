import { notFound } from "next/navigation";
import { updateMember } from "../../actions";
import { FormMessage } from "@/components/molecules";
import { FormPanel } from "@/components/organisms";
import { FormPageTemplate } from "@/components/templates";
import { MemberForm } from "@/features/members/MemberForm";
import { loadMemberForEdit, loadMemberGroups } from "@/features/members/member-directory";
import type { DuplicateConfirmation } from "@/features/members/member-form";
import { firstSearchParam } from "@/features/members/member-list";

type Query = { error?: string | string[]; duplicate?: string | string[] };

function getErrorMessage(error?: string) {
  if (error === "invalid-name") return "이름을 입력하세요.";
  if (error === "invalid-phone") return "연락처 형식을 확인하세요.";
  if (error === "invalid-joined-date") return "가입일을 확인하세요.";
  if (error === "invalid-withdrawn-date") return "탈퇴 상태와 탈퇴일을 확인하세요.";
  if (error === "duplicate-member") return "이미 등록된 회원입니다.";
  if (error === "save-failed") return "회원 정보를 저장하지 못했습니다. 권한 또는 입력값을 확인하세요.";
  return null;
}

function duplicateValue(value?: string): DuplicateConfirmation {
  return value === "phone-reuse" || value === "name-without-phone" ? value : null;
}

export default async function EditMemberPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Query>;
}) {
  const { id } = await params;
  const [member, groups, query] = await Promise.all([
    loadMemberForEdit(id),
    loadMemberGroups(),
    searchParams,
  ]);
  if (!member) notFound();

  const message = getErrorMessage(firstSearchParam(query.error));
  return <FormPageTemplate description="회원번호를 기준으로 기본 정보, 그룹과 상태를 수정합니다." kicker={member.name} title="회원 수정">
    <FormPanel description="회원번호는 변경할 수 없으며 연락처는 권한이 있는 운영자만 수정할 수 있습니다." title="회원 정보">
      <MemberForm action={updateMember} duplicateConfirmation={duplicateValue(firstSearchParam(query.duplicate))} groups={groups} member={member} mode="edit" />
      {message ? <FormMessage>{message}</FormMessage> : null}
    </FormPanel>
  </FormPageTemplate>;
}
