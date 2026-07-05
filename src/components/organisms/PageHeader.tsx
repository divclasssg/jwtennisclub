import type { ReactNode } from "react";
import styles from "./Organisms.module.scss";

type PageHeaderProps = {
  action?: ReactNode;
  description?: ReactNode;
  kicker: ReactNode;
  title: ReactNode;
};

export function PageHeader({
  action,
  description,
  kicker,
  title,
}: PageHeaderProps) {
  return (
    <header className={styles["page-header"]}>
      <div>
        <p className={styles["page-kicker"]}>{kicker}</p>
        <h1 className={styles["page-heading"]}>{title}</h1>
      </div>
      <div className={styles["page-header-side"]}>
        {description ? <p>{description}</p> : null}
        {action}
      </div>
    </header>
  );
}
