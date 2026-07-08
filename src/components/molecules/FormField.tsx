import type { LabelHTMLAttributes, ReactNode } from "react";
import { classNames } from "@/components/ui/class-names";
import styles from "./Molecules.module.scss";

type FormFieldProps = LabelHTMLAttributes<HTMLLabelElement> & {
  label: ReactNode;
};

export function FormField({
  children,
  className,
  label,
  ...props
}: FormFieldProps) {
  return (
    <label className={classNames(styles["form-field"], className)} {...props}>
      <span className={styles["form-field-label"]}>{label}</span>
      {children}
    </label>
  );
}
