import { createMember, importMembersCsv } from "../actions";
import styles from "./page.module.scss";
import { Button } from "@/components/atoms";
import { CsvUploadField, FormMessage } from "@/components/molecules";
import { FormPanel } from "@/components/organisms";
import { MemberForm } from "@/features/members/MemberForm";
import { firstSearchParam } from "@/features/members/member-list";

export type NewMemberSearchParams = {
  error?: string | string[];
  importError?: string | string[];
  line?: string | string[];
};

function getErrorMessage(error: string | undefined) {
  if (error === "invalid-name") {
    return "이름을 입력하세요.";
  }

  if (error === "invalid-phone") {
    return "전화번호는 끝 4자리 숫자만 입력하세요.";
  }

  if (error === "invalid-joined-date") {
    return "가입일을 확인하세요.";
  }

  if (error === "invalid-withdrawn-date") {
    return "탈퇴 상태와 탈퇴일을 확인하세요.";
  }

  if (error === "save-failed") {
    return "회원을 저장하지 못했습니다. 권한 또는 입력값을 확인하세요.";
  }

  return null;
}

function getImportErrorMessage(error: string | undefined, line?: string) {
  if (error === "missing-file") {
    return "CSV 파일을 선택하세요.";
  }

  if (error === "invalid-csv") {
    return `${line ?? "-"}번째 줄을 확인하세요. CSV 형식 또는 입력값이 올바르지 않습니다.`;
  }

  if (error === "too-many-rows") {
    return "CSV는 한 번에 최대 200명까지 등록할 수 있습니다.";
  }

  if (error === "save-failed") {
    return "CSV 회원을 저장하지 못했습니다. 권한 또는 입력값을 확인하세요.";
  }

  return null;
}

type NewMemberContentProps = {
  searchParams: NewMemberSearchParams;
};

export function NewMemberContent({ searchParams }: NewMemberContentProps) {
  const errorMessage = getErrorMessage(firstSearchParam(searchParams.error));
  const importErrorMessage = getImportErrorMessage(
    firstSearchParam(searchParams.importError),
    firstSearchParam(searchParams.line),
  );

  return (
    <>
      <FormPanel
        description="이름, 전화번호 끝 4자리, 가입일을 기준으로 회원을 추가합니다."
        title="단건 등록"
      >
        <MemberForm action={createMember} mode="create" />
        {errorMessage ? <FormMessage>{errorMessage}</FormMessage> : null}
      </FormPanel>

      <FormPanel
        description={
          <>
            헤더는 이름, 전화번호끝4자리, 가입일, 상태, 탈퇴일, 탈퇴사유,
            메모를 사용할 수 있습니다.
          </>
        }
        title="CSV 등록"
      >
        <form action={importMembersCsv} className={styles["member-csv-form"]}>
          <CsvUploadField />
          <Button type="submit">CSV 등록</Button>
        </form>
        {importErrorMessage ? (
          <FormMessage>{importErrorMessage}</FormMessage>
        ) : null}
      </FormPanel>
    </>
  );
}
