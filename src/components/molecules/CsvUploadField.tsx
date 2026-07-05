import type { InputHTMLAttributes, ReactNode } from "react";
import { classNames } from "@/components/ui/class-names";
import styles from "./Molecules.module.scss";

type CsvUploadFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  label?: ReactNode;
};

export function CsvUploadField({
  accept = ".csv,text/csv",
  className,
  label = "CSV 파일",
  name = "csvFile",
  required = true,
  ...props
}: CsvUploadFieldProps) {
  return (
    <label className={classNames(styles["csv-upload-field"], className)}>
      {label}
      <input
        accept={accept}
        name={name}
        required={required}
        type="file"
        {...props}
      />
    </label>
  );
}
