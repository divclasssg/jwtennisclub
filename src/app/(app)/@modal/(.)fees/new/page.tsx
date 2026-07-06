import {
  NewFeePaymentContent,
  type NewFeePaymentSearchParams,
} from "../../../fees/new/NewFeePaymentContent";
import { ModalDialog } from "@/components/molecules";

type NewFeePaymentModalPageProps = {
  searchParams: Promise<NewFeePaymentSearchParams>;
};

export default async function NewFeePaymentModalPage({
  searchParams,
}: NewFeePaymentModalPageProps) {
  const params = await searchParams;

  return (
    <ModalDialog title="회비 CSV 등록">
      <NewFeePaymentContent searchParams={params} />
    </ModalDialog>
  );
}
