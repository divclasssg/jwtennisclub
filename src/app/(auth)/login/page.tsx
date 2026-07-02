import { login } from "./actions";
import styles from "./login.module.css";
import { firstSearchParam, normalizeLoginNext } from "./next-path";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[];
    error?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = normalizeLoginNext(params.next);
  const error = firstSearchParam(params.error);
  const errorMessage =
    error === "missing-fields"
      ? "이메일과 비밀번호를 입력하세요."
      : error === "invalid-credentials"
        ? "로그인 정보가 올바르지 않습니다."
        : null;

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <p className={styles.eyebrow}>JW Tennis Club</p>
        <h1>운영 장부 로그인</h1>
        <p className={styles.description}>
          회원, 회비, 지출, 일정과 월간 정산을 관리합니다.
        </p>
        <form action={login} className={styles.form}>
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
          {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
        </form>
      </section>
    </main>
  );
}
