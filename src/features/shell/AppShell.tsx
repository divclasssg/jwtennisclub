import Link from "next/link";
import { logout } from "@/app/(auth)/login/actions";
import { PageTitleProvider, ShellPageTitle } from "./PageTitleContext";
import { ShellNavigation } from "./ShellNavigation";
import styles from "./AppShell.module.scss";

const baseNavigationItems = [
    { href: "/dashboard", label: "홈" },
    { href: "/members", label: "회원" },
    { href: "/fees", label: "회비" },
    { href: "/expenses", label: "지출" },
    { href: "/schedule", label: "일정" },
    { href: "/settlements", label: "정산" },
];

type AppShellProps = {
    children: React.ReactNode;
    modal?: React.ReactNode;
    showMeetings?: boolean;
    userPositionLabel?: string | null;
    userRoleLabel?: string;
    userDisplayName?: string;
};

export function AppShell({
    children,
    modal,
    showMeetings = false,
    userPositionLabel,
    userRoleLabel = "운영 원장",
    userDisplayName = "JW TENNIS CLUB",
}: AppShellProps) {
    const navigationItems = showMeetings
        ? [
            ...baseNavigationItems.slice(0, 5),
            { href: "/meetings", label: "정모" },
            ...baseNavigationItems.slice(5),
        ]
        : baseNavigationItems;
    const shellKicker = [userRoleLabel, userPositionLabel]
        .filter(Boolean)
        .join(" · ");

    return (
        <PageTitleProvider>
            <div className={styles["shell"]}>
                <header className={styles["shell-global-nav"]}>
                    <Link className={styles["shell-brand"]} href="/dashboard">
                        JW TENNIS CLUB
                    </Link>
                </header>
                <div className={styles["shell-layout"]}>
                    <aside className={styles["shell-sidebar"]}>
                        <ShellNavigation items={navigationItems} />
                    </aside>
                    <div className={styles["shell-workspace"]}>
                        <div className={styles["shell-user-bar"]}>
                            <div className={styles["shell-user-context"]}>
                                <p className={styles["shell-user-name"]}>
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
                        <div className={styles["shell-title-bar"]}>
                            <ShellPageTitle
                                className={styles["shell-page-title"]}
                                fallback={userDisplayName}
                            />
                        </div>
                        <main className={styles["shell-content"]}>{children}</main>
                    </div>
                </div>
                {modal}
            </div>
        </PageTitleProvider>
    );
}
