import type { HTMLAttributes, ReactNode } from "react";
import { classNames } from "@/components/ui/class-names";
import styles from "./Molecules.module.scss";

type EmptyStateProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
};

export function EmptyState({
  className,
  description,
  title,
  ...props
}: EmptyStateProps) {
  return (
    <div className={classNames(styles["empty-state"], className)} {...props}>
      <h2 className={styles["empty-title"]}>{title}</h2>
      {description ? (
        <p className={styles["empty-description"]}>{description}</p>
      ) : null}
    </div>
  );
}
