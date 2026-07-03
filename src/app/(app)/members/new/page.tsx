import { createMember, importMembersCsv } from "../actions";
import styles from "./page.module.scss";
import { MemberForm } from "@/features/members/MemberForm";
import { firstSearchParam } from "@/features/members/member-list";

type NewMemberPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    importError?: string | string[];
    line?: string | string[];
  }>;
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

export default async function NewMemberPage({
  searchParams,
}: NewMemberPageProps) {
  const params = await searchParams;
  const errorMessage = getErrorMessage(firstSearchParam(params.error));
  const importErrorMessage = getImportErrorMessage(
    firstSearchParam(params.importError),
    firstSearchParam(params.line),
  );

  return (
    <section className={styles["member-create-page"]}>
      <header className={styles["member-create-header"]}>
        <div>
          <p className={styles["member-create-kicker"]}>회원 등록</p>
          <h1>새 회원 추가</h1>
        </div>
        <p>
          한 명씩 직접 등록하거나 CSV 파일로 여러 회원을 한 번에 등록합니다.
        </p>
      </header>

      <section className={styles["member-create-panel"]}>
        <div className={styles["member-section-header"]}>
          <h2>단건 등록</h2>
          <p>이름, 전화번호 끝 4자리, 가입일을 기준으로 회원을 추가합니다.</p>
        </div>
        <MemberForm action={createMember} mode="create" />
        {errorMessage ? (
          <p className={styles["member-form-error"]}>{errorMessage}</p>
        ) : null}
      </section>

      <section className={styles["member-create-panel"]}>
        <div className={styles["member-section-header"]}>
          <h2>CSV 등록</h2>
          <p>
            헤더는 이름, 전화번호끝4자리, 가입일, 상태, 탈퇴일, 탈퇴사유,
            메모를 사용할 수 있습니다.
          </p>
        </div>
        <form action={importMembersCsv} className={styles["member-csv-form"]}>
          <label>
            CSV 파일
            <input accept=".csv,text/csv" name="csvFile" required type="file" />
          </label>
          <button type="submit">CSV 등록</button>
        </form>
        {importErrorMessage ? (
          <p className={styles["member-form-error"]}>{importErrorMessage}</p>
        ) : null}
      </section>
    </section>
  );
}
