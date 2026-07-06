import {
  NewFeePaymentContent,
  type NewFeePaymentSearchParams,
} from "./NewFeePaymentContent";
import { FormPageTemplate } from "@/components/templates";

type NewFeePaymentPageProps = {
  searchParams: Promise<NewFeePaymentSearchParams>;
};

export default async function NewFeePaymentPage({
  searchParams,
}: NewFeePaymentPageProps) {
  const params = await searchParams;

  return (
    <FormPageTemplate
      description={
        <>
          입금 내역 CSV를 업로드해 여러 회원의 회비 납부 기록을 한 번에
          등록합니다. 같은 회원과 같은 월은 한 번만 등록할 수 있습니다.
        </>
      }
      kicker="CSV 등록"
      title="회비 납부"
    >
      <NewFeePaymentContent searchParams={params} />
    </FormPageTemplate>
  );
}
