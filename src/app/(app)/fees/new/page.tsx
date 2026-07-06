import { importFeePaymentsCsv } from "../actions";
import styles from "./page.module.scss";
import { Button } from "@/components/atoms";
import { CsvUploadField, FormMessage } from "@/components/molecules";
import { FormPanel } from "@/components/organisms";
import { FormPageTemplate } from "@/components/templates";
import { firstSearchParam } from "@/features/members/member-list";

type NewFeePaymentPageProps = {
  searchParams: Promise<{
    importError?: string | string[];
    line?: string | string[];
  }>;
};

function getImportErrorMessage(error: string | undefined, line: string | undefined) {
  const prefix = line ? `${line}번째 줄을 확인하세요. ` : "";

  if (error === "missing-file") {
    return "CSV 파일을 선택하세요.";
  }

  if (error === "invalid-csv") {
    return `${prefix}CSV 형식 또는 입력값을 확인하세요.`;
  }

  if (error === "too-many-rows") {
    return "CSV는 한 번에 200명 이하로 등록하세요.";
  }

  if (error === "member-load-failed") {
    return "회원 목록을 불러오지 못했습니다.";
  }

  if (error === "member-not-found") {
    return `${prefix}활동 회원 목록에서 이름과 전화번호 끝 4자리가 일치하는 회원을 찾지 못했습니다.`;
  }

  if (error === "save-failed") {
    return "CSV 납부 기록을 저장하지 못했습니다. 중복 기록, 권한, 입력값을 확인하세요.";
  }

  return null;
}

export default async function NewFeePaymentPage({
  searchParams,
}: NewFeePaymentPageProps) {
  const params = await searchParams;
  const importErrorMessage = getImportErrorMessage(
    firstSearchParam(params.importError),
    firstSearchParam(params.line),
  );

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
      <FormPanel
        description={
          <>
            name, phoneLastFour, periodMonth, amount, paidDate, memo 순서로
            여러 납부 기록을 한 번에 등록합니다.
          </>
        }
        title="업로드 파일"
      >
        <form action={importFeePaymentsCsv} className={styles["fee-csv-form"]}>
          <CsvUploadField />
          <Button type="submit">CSV 등록</Button>
        </form>
        {importErrorMessage ? (
          <FormMessage>{importErrorMessage}</FormMessage>
        ) : null}
      </FormPanel>
    </FormPageTemplate>
  );
}
