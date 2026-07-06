import {
  NewMemberContent,
  type NewMemberSearchParams,
} from "./NewMemberContent";
import { FormPageTemplate } from "@/components/templates";

type NewMemberPageProps = {
  searchParams: Promise<NewMemberSearchParams>;
};

export default async function NewMemberPage({
  searchParams,
}: NewMemberPageProps) {
  const params = await searchParams;

  return (
    <FormPageTemplate
      description="한 명씩 직접 등록하거나 CSV 파일로 여러 회원을 한 번에 등록합니다."
      kicker="새 회원 추가"
      title="회원 등록"
    >
      <NewMemberContent searchParams={params} />
    </FormPageTemplate>
  );
}
