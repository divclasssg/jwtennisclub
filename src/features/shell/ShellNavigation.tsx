"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./AppShell.module.scss";

type NavigationItem = {
  href: string;
  label: string;
};

type ShellNavigationProps = {
  items: NavigationItem[];
};

export function ShellNavigation({ items }: ShellNavigationProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="주요 메뉴" className={styles["shell-nav"]}>
      {items.map((item) => {
        const isCurrent =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            aria-current={isCurrent ? "page" : undefined}
            className={styles["shell-nav-link"]}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
