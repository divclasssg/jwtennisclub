import type { HTMLAttributes, ReactNode } from "react";
import { classNames } from "@/components/ui/class-names";
import styles from "./Molecules.module.scss";

type PanelHeaderProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  title: ReactNode;
  side?: ReactNode;
};

export function PanelHeader({
  className,
  side,
  title,
  ...props
}: PanelHeaderProps) {
  return (
    <div className={classNames(styles["panel-header"], className)} {...props}>
      <p className={styles["panel-title"]}>{title}</p>
      {side ? <div className={styles["panel-side"]}>{side}</div> : null}
    </div>
  );
}
