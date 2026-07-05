import type { HTMLAttributes } from "react";
import { classNames } from "@/components/ui/class-names";
import styles from "./Molecules.module.scss";

type RowActionsProps = HTMLAttributes<HTMLDivElement>;

export function RowActions({ className, ...props }: RowActionsProps) {
  return (
    <div className={classNames(styles["row-actions"], className)} {...props} />
  );
}
