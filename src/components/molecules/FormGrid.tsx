import type { HTMLAttributes } from "react";
import { classNames } from "@/components/ui/class-names";
import styles from "./Molecules.module.scss";

type FormGridProps = HTMLAttributes<HTMLDivElement>;

export function FormGrid({ className, ...props }: FormGridProps) {
  return <div className={classNames(styles["form-grid"], className)} {...props} />;
}
