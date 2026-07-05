import type { HTMLAttributes } from "react";
import { classNames } from "@/components/ui/class-names";
import styles from "./Molecules.module.scss";

type TableScrollAreaProps = HTMLAttributes<HTMLDivElement>;

export function TableScrollArea({
  className,
  ...props
}: TableScrollAreaProps) {
  return (
    <div
      className={classNames(styles["table-scroll-area"], className)}
      {...props}
    />
  );
}
