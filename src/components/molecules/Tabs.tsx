import Link from "next/link";
import type { ComponentProps, HTMLAttributes } from "react";
import { classNames } from "@/components/ui/class-names";
import styles from "./Molecules.module.scss";

type TabsProps = HTMLAttributes<HTMLElement> & {
  columns?: 2 | 3;
};

type TabLinkProps = ComponentProps<typeof Link> & {
  isCurrent?: boolean;
};

export function Tabs({
  children,
  className,
  columns = 3,
  ...props
}: TabsProps) {
  return (
    <nav
      className={classNames(
        styles.tabs,
        styles[`tabs-${columns}`],
        className,
      )}
      {...props}
    >
      {children}
    </nav>
  );
}

export function TabLink({
  className,
  isCurrent = false,
  ...props
}: TabLinkProps) {
  return (
    <Link
      aria-current={isCurrent ? "page" : undefined}
      className={classNames(styles["tab-link"], className)}
      {...props}
    />
  );
}
