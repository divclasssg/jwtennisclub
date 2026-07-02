import Link from "next/link";
import { logout } from "@/app/(auth)/login/actions";
import styles from "./AppShell.module.css";

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
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>JW Tennis Club</div>
        <nav aria-label="주요 메뉴" className={styles.nav}>
          {navigationItems.map((item) => (
            <Link className={styles.navLink} href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>운영 원장</p>
            <p className={styles.headerTitle}>JW Tennis Club</p>
          </div>
          <form action={logout}>
            <button className={styles.logoutButton} type="submit">
              로그아웃
            </button>
          </form>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
