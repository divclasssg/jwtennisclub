import { login } from "./actions";
import styles from "./login.module.scss";
import { firstSearchParam, normalizeLoginNext } from "./next-path";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[];
    error?: string | string[];
    status?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = normalizeLoginNext(params.next);
  const error = firstSearchParam(params.error);
  const status = firstSearchParam(params.status);
  const errorMessage =
    error === "missing-fields"
      ? "이메일과 비밀번호를 입력하세요."
      : error === "invalid-credentials"
        ? "로그인 정보가 올바르지 않습니다."
        : null;
  const statusMessage =
    status === "password-updated"
      ? "비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인하세요."
      : null;

  return (
    <main className={styles["login-page"]}>
      <section className={styles["login-panel"]}>
        <h1>JW_TENNIS Club</h1>
        <form action={login} className={styles["login-form"]}>
          <input type="hidden" name="next" value={next} />
          <label>
            이메일
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            비밀번호
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit">로그인</button>
          {statusMessage ? (
            <p className={styles["login-success"]}>{statusMessage}</p>
          ) : null}
          {errorMessage ? (
            <p className={styles["login-error"]}>{errorMessage}</p>
          ) : null}
        </form>
      </section>
    </main>
  );
}
