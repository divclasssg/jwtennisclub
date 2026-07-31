import { importFeePaymentsCsv } from "../actions";
import styles from "./page.module.scss";
import { Button } from "@/components/atoms";
import { CsvUploadField, FormMessage } from "@/components/molecules";
import { FormPanel } from "@/components/organisms";
import { firstSearchParam } from "@/features/members/member-list";

export type NewFeePaymentSearchParams = {
  importError?: string | string[];
  line?: string | string[];
  month?: string | string[];
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
    return `${prefix}활동 회원 목록에서 회원번호가 일치하는 회원을 찾지 못했습니다.`;
  }

  if (error === "save-failed") {
    return "CSV 납부 기록을 저장하지 못했습니다. 중복 기록, 권한, 입력값을 확인하세요.";
  }

  if (error === "closing-locked") {
    return "최종 마감된 월입니다. 회비와 지출을 수정하려면 먼저 결산을 재개하세요.";
  }

  return null;
}

type NewFeePaymentContentProps = {
  searchParams: NewFeePaymentSearchParams;
};

export function NewFeePaymentContent({
  searchParams,
}: NewFeePaymentContentProps) {
  const importErrorMessage = getImportErrorMessage(
    firstSearchParam(searchParams.importError),
    firstSearchParam(searchParams.line),
  );

  return (
    <FormPanel
      description={
        <>
          memberCode, periodMonth, amount, paidDate, memo 순서로 여러
          납부 기록을 한 번에 등록합니다.
        </>
      }
      title="업로드 파일"
    >
      <form action={importFeePaymentsCsv} className={styles["fee-csv-form"]}>
        <CsvUploadField />
        <Button type="submit">CSV 등록</Button>
      </form>
      {importErrorMessage ? <FormMessage>{importErrorMessage}</FormMessage> : null}
    </FormPanel>
  );
}
