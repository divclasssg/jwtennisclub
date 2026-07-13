import {
  EditMemberContent,
  type EditMemberPageProps,
} from "@/app/(app)/members/[id]/edit/EditMemberContent";
import { ModalDialog } from "@/components/molecules";

export default async function EditMemberModalPage(props: EditMemberPageProps) {
  return (
    <ModalDialog title="회원 수정">
      {await EditMemberContent(props)}
    </ModalDialog>
  );
}
