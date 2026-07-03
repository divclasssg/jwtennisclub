import { changePassword } from "./actions";
import styles from "./page.module.scss";

type PasswordPageProps = {
    searchParams: Promise<{
        error?: string | string[];
        status?: string | string[];
    }>;
};

function firstSearchParam(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

function getErrorMessage(error: string | undefined) {
    if (error === "missing-fields") {
        return "모든 비밀번호 항목을 입력하세요.";
    }

    if (error === "password-too-short") {
        return "새 비밀번호는 8자 이상이어야 합니다.";
    }

    if (error === "password-mismatch") {
        return "새 비밀번호와 확인 값이 일치하지 않습니다.";
    }

    if (error === "same-password") {
        return "현재 비밀번호와 다른 새 비밀번호를 입력하세요.";
    }

    if (error === "invalid-current-password") {
        return "현재 비밀번호가 올바르지 않습니다.";
    }

    if (error === "update-failed") {
        return "비밀번호를 변경하지 못했습니다. 잠시 후 다시 시도하세요.";
    }

    return null;
}

export default async function PasswordPage({ searchParams }: PasswordPageProps) {
    const params = await searchParams;
    const errorMessage = getErrorMessage(firstSearchParam(params.error));
    const status = firstSearchParam(params.status);
    const successMessage =
        status === "updated" ? "비밀번호가 변경되었습니다." : null;

    return (
        <section className={styles["password-page"]}>
            <div className={styles["password-panel"]}>
                <div className={styles["password-header"]}>
                    <p className={styles["password-kicker"]}>계정 보안</p>
                    <h1>비밀번호 변경</h1>
                    <p>
                        현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다.
                    </p>
                </div>

                <form action={changePassword} className={styles["password-form"]}>
                    <label>
                        현재 비밀번호
                        <input
                            autoComplete="current-password"
                            name="currentPassword"
                            required
                            type="password"
                        />
                    </label>
                    <label>
                        새 비밀번호
                        <input
                            autoComplete="new-password"
                            minLength={8}
                            name="newPassword"
                            required
                            type="password"
                        />
                    </label>
                    <label>
                        새 비밀번호 확인
                        <input
                            autoComplete="new-password"
                            minLength={8}
                            name="confirmPassword"
                            required
                            type="password"
                        />
                    </label>

                    <button type="submit">비밀번호 변경</button>

                    {successMessage ? (
                        <p className={styles["password-success"]}>
                            {successMessage}
                        </p>
                    ) : null}
                    {errorMessage ? (
                        <p className={styles["password-error"]}>{errorMessage}</p>
                    ) : null}
                </form>
            </div>
        </section>
    );
}
