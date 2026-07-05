import type { ButtonHTMLAttributes } from "react";
import { classNames } from "@/components/ui/class-names";
import styles from "./Button.module.scss";

type ButtonVariant = "primary" | "secondary" | "danger";
type ButtonSize = "default" | "compact";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  className,
  size = "default",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={classNames(
        styles.button,
        styles[variant],
        size === "compact" && styles.compact,
        className,
      )}
      {...props}
    />
  );
}
