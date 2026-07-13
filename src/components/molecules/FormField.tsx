import type { LabelHTMLAttributes, ReactNode } from "react";
import { classNames } from "@/components/ui/class-names";
import styles from "./Molecules.module.scss";

type FormFieldProps = LabelHTMLAttributes<HTMLLabelElement> & {
  label: ReactNode;
  labelVisible?: boolean;
};

export function FormField({
  children,
  className,
  label,
  labelVisible = false,
  ...props
}: FormFieldProps) {
  return (
    <label className={classNames(styles["form-field"], className)} {...props}>
      <span
        className={classNames(
          styles["form-field-label"],
          labelVisible && styles["form-field-label-visible"],
        )}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
