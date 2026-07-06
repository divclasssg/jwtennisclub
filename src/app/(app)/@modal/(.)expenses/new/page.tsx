import {
  NewExpenseContent,
  type NewExpenseSearchParams,
} from "../../../expenses/new/NewExpenseContent";
import { ModalDialog } from "@/components/molecules";

type NewExpenseModalPageProps = {
  searchParams: Promise<NewExpenseSearchParams>;
};

export default async function NewExpenseModalPage({
  searchParams,
}: NewExpenseModalPageProps) {
  const params = await searchParams;

  return (
    <ModalDialog title="지출 등록">
      <NewExpenseContent searchParams={params} />
    </ModalDialog>
  );
}
