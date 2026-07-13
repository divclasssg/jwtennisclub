import { ModalDialog } from "@/components/molecules";
import {
  EditMemberContent,
  type EditMemberPageProps,
} from "./EditMemberContent";

export default async function EditMemberPage(props: EditMemberPageProps) {
  return (
    <ModalDialog title="회원 수정">
      {await EditMemberContent(props)}
    </ModalDialog>
  );
}
