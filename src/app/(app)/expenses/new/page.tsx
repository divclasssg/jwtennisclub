import {
  NewExpenseContent,
  type NewExpenseSearchParams,
} from "./NewExpenseContent";
import { FormPageTemplate } from "@/components/templates";

type NewExpensePageProps = {
  searchParams: Promise<NewExpenseSearchParams>;
};

export default async function NewExpensePage({ searchParams }: NewExpensePageProps) {
  const params = await searchParams;

  return (
    <FormPageTemplate
      description="운영 중 발생한 지출 내역을 기록합니다."
      kicker="지출 등록"
      title="지출 관리"
    >
      <NewExpenseContent searchParams={params} />
    </FormPageTemplate>
  );
}
