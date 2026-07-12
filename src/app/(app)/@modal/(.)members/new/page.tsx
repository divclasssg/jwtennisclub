import {
  NewMemberContent,
  type NewMemberSearchParams,
} from "../../../members/new/NewMemberContent";
import { ModalDialog } from "@/components/molecules";
import { loadMemberGroups } from "@/features/members/member-directory";

type NewMemberModalPageProps = {
  searchParams: Promise<NewMemberSearchParams>;
};

export default async function NewMemberModalPage({
  searchParams,
}: NewMemberModalPageProps) {
  const params = await searchParams;
  const groups = await loadMemberGroups();

  return (
    <ModalDialog title="회원 등록">
      <NewMemberContent groups={groups} searchParams={params} />
    </ModalDialog>
  );
}
