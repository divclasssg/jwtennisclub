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

function SortDirectionIcon({ activeDirection }: { activeDirection: SortDirection | null }) {
  return (
    <svg
      aria-hidden="true"
      className={styles["sort-direction-icon"]}
      viewBox="0 0 20 20"
    >
      <path
        className={`${styles["sort-direction-arrow"]}${activeDirection === "asc" ? ` ${styles["sort-direction-arrow-active"]}` : ""}`}
        d="M5 16V7.8L2.8 10 1.5 8.7 6 4.2l4.5 4.5L9.2 10 7 7.8V16H5Z"
        data-sort-direction="asc"
        data-state={activeDirection === "asc" ? "active" : "inactive"}
      />
      <path
        className={`${styles["sort-direction-arrow"]}${activeDirection === "desc" ? ` ${styles["sort-direction-arrow-active"]}` : ""}`}
        d="M13 4v8.2L10.8 10l-1.3 1.3 4.5 4.5 4.5-4.5-1.3-1.3-2.2 2.2V4h-2Z"
        data-sort-direction="desc"
        data-state={activeDirection === "desc" ? "active" : "inactive"}
      />
    </svg>
  );
}

export function SortableTableHeader<TKey extends string>({
  label,
  pathname,
  searchParams,
  sortKey,
  sortState,
}: SortableTableHeaderProps<TKey>) {
  const isActive = sortState.key === sortKey;
  const nextDirection = isActive && sortState.direction === "asc" ? "desc" : "asc";
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
        <SortDirectionIcon activeDirection={isActive ? sortState.direction : null} />
      </Link>
    </th>
  );
}
