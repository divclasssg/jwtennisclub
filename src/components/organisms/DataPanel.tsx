import type { HTMLAttributes, ReactNode } from "react";
import { PanelHeader } from "@/components/molecules";
import { classNames } from "@/components/ui/class-names";
import styles from "./Organisms.module.scss";

type DataPanelProps = HTMLAttributes<HTMLElement> & {
  empty?: ReactNode;
  headerSide?: ReactNode;
  headerTitle: ReactNode;
};

export function DataPanel({
  children,
  className,
  empty,
  headerSide,
  headerTitle,
  ...props
}: DataPanelProps) {
  return (
    <section className={classNames(styles["data-panel"], className)} {...props}>
      <PanelHeader side={headerSide} title={headerTitle} />
      {children ?? empty}
    </section>
  );
}
