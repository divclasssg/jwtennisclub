import type { FormHTMLAttributes } from "react";
import { classNames } from "@/components/ui/class-names";
import styles from "./Molecules.module.scss";

type FilterBarLayout =
  | "search"
  | "month-search-status"
  | "two-controls"
  | "single-control";

type FilterBarProps = FormHTMLAttributes<HTMLFormElement> & {
  layout?: FilterBarLayout;
};

const layoutClassNames: Record<FilterBarLayout, string> = {
  search: styles["filter-search"],
  "month-search-status": styles["filter-month-search-status"],
  "two-controls": styles["filter-two-controls"],
  "single-control": styles["filter-single-control"],
};

export function FilterBar({
  className,
  layout = "search",
  ...props
}: FilterBarProps) {
  return (
    <form
      className={classNames(
        styles["filter-bar"],
        layoutClassNames[layout],
        className,
      )}
      {...props}
    />
  );
}
