import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { classNames } from "@/components/ui/class-names";
import styles from "./FormControls.module.scss";

type ControlShape = "pill" | "rounded";

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  shape?: ControlShape;
};

type DateInputProps = Omit<TextInputProps, "type">;

type SelectInputProps = SelectHTMLAttributes<HTMLSelectElement> & {
  shape?: ControlShape;
};

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextInput({
  className,
  shape = "rounded",
  type = "text",
  ...props
}: TextInputProps) {
  return (
    <input
      className={classNames(styles.control, styles[shape], className)}
      type={type}
      {...props}
    />
  );
}

export function DateInput({ className, shape = "rounded", ...props }: DateInputProps) {
  return (
    <input
      className={classNames(styles.control, styles[shape], className)}
      type="date"
      {...props}
    />
  );
}

export function SelectInput({
  className,
  shape = "rounded",
  ...props
}: SelectInputProps) {
  return (
    <select
      className={classNames(styles.control, styles[shape], className)}
      {...props}
    />
  );
}

export function TextArea({ className, ...props }: TextAreaProps) {
  return (
    <textarea
      className={classNames(styles.control, styles.textarea, className)}
      {...props}
    />
  );
}
