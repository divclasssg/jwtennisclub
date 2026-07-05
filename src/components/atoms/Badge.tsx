import type { HTMLAttributes } from "react";
import { classNames } from "@/components/ui/class-names";
import styles from "./Badge.module.scss";

type BadgeTone = "success" | "danger" | "info" | "muted";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({
  className,
  tone = "muted",
  ...props
}: BadgeProps) {
  return (
    <span
      className={classNames(styles.badge, styles[tone], className)}
      {...props}
    />
  );
}
