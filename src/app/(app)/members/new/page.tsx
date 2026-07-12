import {
  NewMemberContent,
  type NewMemberSearchParams,
} from "./NewMemberContent";
import { FormPageTemplate } from "@/components/templates";
import { loadMemberGroups } from "@/features/members/member-directory";

type NewMemberPageProps = {
  searchParams: Promise<NewMemberSearchParams>;
};

export default async function NewMemberPage({
  searchParams,
}: NewMemberPageProps) {
  const params = await searchParams;
  const groups = await loadMemberGroups();

  return (
    <FormPageTemplate
      description="회원번호는 등록 시 자동 발급되며 회원 정보는 이후에도 수정할 수 있습니다."
      kicker="새 회원 추가"
      title="회원 등록"
    >
      <NewMemberContent groups={groups} searchParams={params} />
    </FormPageTemplate>
  );
}
