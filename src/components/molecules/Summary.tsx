import type { HTMLAttributes, ReactNode } from "react";
import { classNames } from "@/components/ui/class-names";
import styles from "./Molecules.module.scss";

type SummaryGridColumns = 2 | 3 | 4;

type SummaryGridProps = HTMLAttributes<HTMLElement> & {
  columns?: SummaryGridColumns;
  variant?: "cards" | "divided";
};

type SummaryCardProps = HTMLAttributes<HTMLElement> & {
  label: ReactNode;
  value: ReactNode;
};

export function SummaryGrid({
  children,
  className,
  columns = 2,
  variant = "cards",
  ...props
}: SummaryGridProps) {
  return (
    <section
      className={classNames(
        styles["summary-grid"],
        styles[`summary-grid-${columns}`],
        variant === "divided" && styles["summary-grid-divided"],
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function SummaryCard({
  className,
  label,
  value,
  ...props
}: SummaryCardProps) {
  return (
    <article className={classNames(styles["summary-card"], className)} {...props}>
      <p className={styles["summary-label"]}>{label}</p>
      <strong className={styles["summary-value"]}>{value}</strong>
    </article>
  );
}
