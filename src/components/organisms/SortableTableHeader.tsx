import Link from "next/link";
import styles from "./Organisms.module.scss";
import { buildSortHref, type SortDirection, type SortSearchParams, type SortState } from "./table-sort";

type SortableTableHeaderProps<TKey extends string> = {
  label: string;
  pathname: string;
  searchParams: SortSearchParams;
  sortKey: TKey;
  sortState: SortState<TKey>;
};

const DIRECTIONS: { direction: SortDirection; label: string; symbol: string }[] = [
  { direction: "asc", label: "오름차순", symbol: "↑" },
  { direction: "desc", label: "내림차순", symbol: "↓" },
];

export function SortableTableHeader<TKey extends string>({
  label,
  pathname,
  searchParams,
  sortKey,
  sortState,
}: SortableTableHeaderProps<TKey>) {
  return (
    <th scope="col">
      <span className={styles["sortable-table-header"]}>
        <span>{label}</span>
        <span className={styles["sort-controls"]}>
          {DIRECTIONS.map(({ direction, label: directionLabel, symbol }) => {
            const isActive = sortState.key === sortKey && sortState.direction === direction;
            return (
              <Link
                aria-current={isActive ? "true" : undefined}
                aria-label={`${label} ${directionLabel} 정렬`}
                className={`${styles["sort-link"]}${isActive ? ` ${styles["sort-link-active"]}` : ""}`}
                href={buildSortHref(pathname, searchParams, sortKey, direction)}
                key={direction}
              >
                {symbol}
              </Link>
            );
          })}
        </span>
      </span>
    </th>
  );
}
