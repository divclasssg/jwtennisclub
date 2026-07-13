export type SortDirection = "asc" | "desc";

export type SortSearchParams = Record<
  string,
  string | string[] | undefined
>;

export type SortState<TKey extends string> = {
  key: TKey;
  direction: SortDirection;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseSortState<TKey extends string>(
  params: SortSearchParams,
  allowedKeys: readonly TKey[],
  fallback: SortState<TKey>,
): SortState<TKey> {
  const key = first(params.sort);
  const direction = first(params.direction);

  if (
    !allowedKeys.includes(key as TKey) ||
    (direction !== "asc" && direction !== "desc")
  ) {
    return fallback;
  }

  return { key: key as TKey, direction };
}

export function buildSortHref(
  pathname: string,
  params: SortSearchParams,
  key: string,
  direction: SortDirection,
) {
  const nextParams = new URLSearchParams();

  for (const [name, value] of Object.entries(params)) {
    if (name === "sort" || name === "direction" || value === undefined) {
      continue;
    }

    for (const item of Array.isArray(value) ? value : [value]) {
      nextParams.append(name, item);
    }
  }

  nextParams.set("sort", key);
  nextParams.set("direction", direction);
  return `${pathname}?${nextParams}`;
}

type SortValue = string | number | null | undefined;

function compareValues(left: Exclude<SortValue, null | undefined>, right: Exclude<SortValue, null | undefined>) {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right), "ko-KR", { numeric: true });
}

export function stableSortRows<T>(
  rows: readonly T[],
  getValue: (row: T) => SortValue,
  direction: SortDirection,
) {
  return rows
    .map((row, index) => ({ row, index, value: getValue(row) }))
    .sort((left, right) => {
      const leftEmpty = left.value === null || left.value === undefined || left.value === "";
      const rightEmpty = right.value === null || right.value === undefined || right.value === "";

      if (leftEmpty !== rightEmpty) {
        return leftEmpty ? 1 : -1;
      }

      if (leftEmpty && rightEmpty) {
        return left.index - right.index;
      }

      const comparison = compareValues(
        left.value as Exclude<SortValue, null | undefined>,
        right.value as Exclude<SortValue, null | undefined>,
      );

      return comparison === 0
        ? left.index - right.index
        : comparison * (direction === "asc" ? 1 : -1);
    })
    .map(({ row }) => row);
}
