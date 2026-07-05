import type { HTMLAttributes } from "react";
import { classNames } from "@/components/ui/class-names";
import styles from "./Molecules.module.scss";

type FormMessageTone = "error" | "success";

type FormMessageProps = HTMLAttributes<HTMLParagraphElement> & {
  tone?: FormMessageTone;
};

export function FormMessage({
  className,
  tone = "error",
  ...props
}: FormMessageProps) {
  return (
    <p
      className={classNames(
        styles["form-message"],
        styles[`form-message-${tone}`],
        className,
      )}
      role={tone === "error" ? "alert" : "status"}
      {...props}
    />
  );
}
