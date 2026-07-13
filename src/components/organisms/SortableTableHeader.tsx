import Link from "next/link";
import styles from "./Organisms.module.scss";
import { buildSortHref, type SortSearchParams, type SortState } from "./table-sort";

type SortableTableHeaderProps<TKey extends string> = {
  label: string;
  pathname: string;
  searchParams: SortSearchParams;
  sortKey: TKey;
  sortState: SortState<TKey>;
};

export function SortableTableHeader<TKey extends string>({
  label,
  pathname,
  searchParams,
  sortKey,
  sortState,
}: SortableTableHeaderProps<TKey>) {
  const isActive = sortState.key === sortKey;
  const nextDirection = isActive && sortState.direction === "asc" ? "desc" : "asc";
  const symbol = isActive ? (sortState.direction === "asc" ? "↑" : "↓") : "↕";
  const nextDirectionLabel = nextDirection === "asc" ? "오름차순" : "내림차순";

  return (
    <th
      aria-sort={isActive ? (sortState.direction === "asc" ? "ascending" : "descending") : undefined}
      scope="col"
    >
      <Link
        aria-current={isActive ? "true" : undefined}
        aria-label={`${label} ${nextDirectionLabel} 정렬`}
        className={`${styles["sort-link"]}${isActive ? ` ${styles["sort-link-active"]}` : ""}`}
        href={buildSortHref(pathname, searchParams, sortKey, nextDirection)}
      >
        <span>{label}</span>
        <span aria-hidden="true" className={styles["sort-direction-indicator"]}>
          {symbol}
        </span>
      </Link>
    </th>
  );
}
