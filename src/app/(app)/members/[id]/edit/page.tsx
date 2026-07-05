import { notFound } from "next/navigation";
import { updateMember } from "../../actions";
import { FormMessage } from "@/components/molecules";
import { FormPanel } from "@/components/organisms";
import { FormPageTemplate } from "@/components/templates";
import { MemberForm } from "@/features/members/MemberForm";
import { firstSearchParam, mapMemberRow } from "@/features/members/member-list";
import { createClient } from "@/lib/supabase/server";

type EditMemberPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string | string[];
  }>;
};

function getErrorMessage(error: string | undefined) {
  if (error === "invalid-name") {
    return "이름을 입력하세요.";
  }

  if (error === "invalid-phone") {
    return "전화번호는 끝 4자리 숫자만 입력하세요.";
  }

  if (error === "invalid-joined-date") {
    return "가입일을 확인하세요.";
  }

  if (error === "invalid-withdrawn-date") {
    return "탈퇴 상태와 탈퇴일을 확인하세요.";
  }

  if (error === "save-failed") {
    return "회원 정보를 저장하지 못했습니다. 권한 또는 입력값을 확인하세요.";
  }

  return null;
}

async function getMember(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .select(
      "id, name, phone_last_four, status, joined_date, withdrawn_date, withdrawal_reason, memo",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error("회원 정보를 불러오지 못했습니다.");
  }

  return data ? mapMemberRow(data) : null;
}

export default async function EditMemberPage({
  params,
  searchParams,
}: EditMemberPageProps) {
  const { id } = await params;
  const member = await getMember(id);
  const errorMessage = getErrorMessage(
    firstSearchParam((await searchParams).error),
  );

  if (!member) {
    notFound();
  }

  return (
    <FormPageTemplate
      description="회원 기본 정보, 상태, 탈퇴 처리 정보를 수정합니다."
      kicker="회원 수정"
      title={member.name}
    >
      <FormPanel
        description="상태 변경과 탈퇴 처리가 필요한 경우 관련 날짜와 사유를 함께 입력합니다."
        title="회원 정보"
      >
        <MemberForm action={updateMember} member={member} mode="edit" />
        {errorMessage ? (
          <FormMessage>{errorMessage}</FormMessage>
        ) : null}
      </FormPanel>
    </FormPageTemplate>
  );
}
