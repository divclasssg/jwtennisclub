import Link from "next/link";
import { logout } from "@/app/(auth)/login/actions";
import styles from "./AppShell.module.scss";

const navigationItems = [
    { href: "/dashboard", label: "홈" },
    { href: "/members", label: "회원" },
    { href: "/fees", label: "회비" },
    { href: "/expenses", label: "지출" },
    { href: "/schedule", label: "일정" },
    { href: "/settlements", label: "정산" },
    { href: "/reports", label: "PDF" },
    { href: "/settings", label: "설정" },
];

type AppShellProps = {
    children: React.ReactNode;
    userPositionLabel?: string | null;
    userRoleLabel?: string;
    userDisplayName?: string;
};

export function AppShell({
    children,
    userPositionLabel,
    userRoleLabel = "운영 원장",
    userDisplayName = "JW Tennis Club",
}: AppShellProps) {
    const shellKicker = [userRoleLabel, userPositionLabel]
        .filter(Boolean)
        .join(" · ");

    return (
        <div className={styles["shell"]}>
            <header className={styles["shell-global-nav"]}>
                <Link className={styles["shell-brand"]} href="/dashboard">
                    JW_TENNIS Club
                </Link>
                <nav aria-label="주요 메뉴" className={styles["shell-nav"]}>
                    {navigationItems.map((item) => (
                        <Link
                            className={styles["shell-nav-link"]}
                            href={item.href}
                            key={item.href}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>
            </header>
            <div className={styles["shell-sub-nav"]}>
                <div className={styles["shell-sub-nav-content"]}>
                    <p className={styles["shell-header-title"]}>
                        {userDisplayName}
                    </p>
                    <p className={styles["shell-kicker"]}>{shellKicker}</p>
                </div>
                <div className={styles["shell-account-actions"]}>
                    <Link
                        className={styles["shell-password-link"]}
                        href="/settings/password"
                    >
                        비밀번호 변경
                    </Link>
                    <form action={logout}>
                        <button
                            className={styles["shell-logout-button"]}
                            type="submit"
                        >
                            로그아웃
                        </button>
                    </form>
                </div>
            </div>
            <main className={styles["shell-content"]}>{children}</main>
        </div>
    );
}
