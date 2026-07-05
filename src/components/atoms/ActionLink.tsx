import Link from "next/link";
import type { ComponentProps } from "react";
import { classNames } from "@/components/ui/class-names";
import styles from "./ActionLink.module.scss";

type ActionLinkVariant = "primary" | "secondary";
type ActionLinkSize = "default" | "compact";

type ActionLinkProps = ComponentProps<typeof Link> & {
  variant?: ActionLinkVariant;
  size?: ActionLinkSize;
};

export function ActionLink({
  className,
  size = "default",
  variant = "primary",
  ...props
}: ActionLinkProps) {
  return (
    <Link
      className={classNames(
        styles["action-link"],
        styles[variant],
        size === "compact" && styles.compact,
        className,
      )}
      {...props}
    />
  );
}
