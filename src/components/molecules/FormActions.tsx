import type { HTMLAttributes } from "react";
import { classNames } from "@/components/ui/class-names";
import styles from "./Molecules.module.scss";

type FormActionsProps = HTMLAttributes<HTMLDivElement>;

export function FormActions({ className, ...props }: FormActionsProps) {
  return (
    <div className={classNames(styles["form-actions"], className)} {...props} />
  );
}
