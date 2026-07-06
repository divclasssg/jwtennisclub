import {
  NewMemberContent,
  type NewMemberSearchParams,
} from "../../../members/new/NewMemberContent";
import { ModalDialog } from "@/components/molecules";

type NewMemberModalPageProps = {
  searchParams: Promise<NewMemberSearchParams>;
};

export default async function NewMemberModalPage({
  searchParams,
}: NewMemberModalPageProps) {
  const params = await searchParams;

  return (
    <ModalDialog title="회원 등록">
      <NewMemberContent searchParams={params} />
    </ModalDialog>
  );
}
