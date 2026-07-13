import {
  EditMemberContent,
  type EditMemberPageProps,
} from "@/app/(app)/members/[id]/edit/EditMemberContent";
import { ModalDialog } from "@/components/molecules";
import { Suspense } from "react";

export default function EditMemberModalPage(props: EditMemberPageProps) {
  return (
    <ModalDialog title="회원 수정">
      <Suspense
        fallback={
          <p aria-live="polite" role="status">
            회원 정보를 불러오는 중입니다.
          </p>
        }
      >
        <EditMemberContent {...props} />
      </Suspense>
    </ModalDialog>
  );
}
