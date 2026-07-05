import type { TableHTMLAttributes } from "react";
import { TableScrollArea } from "@/components/molecules";
import { classNames } from "@/components/ui/class-names";
import styles from "./Organisms.module.scss";

type DataTableProps = TableHTMLAttributes<HTMLTableElement>;

export function DataTable({ className, ...props }: DataTableProps) {
  return (
    <TableScrollArea>
      <table className={classNames(styles["data-table"], className)} {...props} />
    </TableScrollArea>
  );
}
