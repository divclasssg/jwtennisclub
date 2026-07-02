import Link from "next/link";
import { logout } from "@/app/(auth)/login/actions";
import styles from "./AppShell.module.scss";

const navigationItems = [
  { href: "/dashboard", label: "대시보드" },
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
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className={styles["shell"]}>
      <aside className={styles["shell-sidebar"]}>
        <div className={styles["shell-brand"]}>JW Tennis Club</div>
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
      </aside>

      <div className={styles["shell-workspace"]}>
        <header className={styles["shell-header"]}>
          <div>
            <p className={styles["shell-kicker"]}>운영 원장</p>
            <p className={styles["shell-header-title"]}>JW Tennis Club</p>
          </div>
          <form action={logout}>
            <button className={styles["shell-logout-button"]} type="submit">
              로그아웃
            </button>
          </form>
        </header>
        <main className={styles["shell-content"]}>{children}</main>
      </div>
    </div>
  );
}