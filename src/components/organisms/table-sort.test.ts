import { describe, expect, it } from "vitest";
import { buildSortHref, parseSortState, stableSortRows } from "./table-sort";

describe("table sort helpers", () => {
  const fallback = { key: "date" as const, direction: "asc" as const };

  it("accepts whitelisted sort state and rejects unsupported values", () => {
    expect(parseSortState({ sort: "name", direction: "desc" }, ["name", "date"] as const, fallback)).toEqual({ key: "name", direction: "desc" });
    expect(parseSortState({ sort: "unknown", direction: "desc" }, ["name", "date"] as const, fallback)).toEqual(fallback);
    expect(parseSortState({ sort: "name", direction: "sideways" }, ["name", "date"] as const, fallback)).toEqual(fallback);
  });

  it("preserves filters while replacing sort state", () => {
    expect(buildSortHref("/members", { q: "김", status: "active", empty: undefined }, "name", "asc")).toBe(
      "/members?q=%EA%B9%80&status=active&sort=name&direction=asc",
    );
  });

  it("sorts strings naturally without mutating the input", () => {
    const rows = [{ value: "회원10" }, { value: "회원2" }];
    expect(stableSortRows(rows, (row) => row.value, "asc").map((row) => row.value)).toEqual(["회원2", "회원10"]);
    expect(rows.map((row) => row.value)).toEqual(["회원10", "회원2"]);
  });

  it("sorts numbers stably and always places empty values last", () => {
    const rows = [
      { id: "empty", value: null },
      { id: "low-a", value: 10 },
      { id: "high", value: 20 },
      { id: "low-b", value: 10 },
    ];

    expect(stableSortRows(rows, (row) => row.value, "asc").map((row) => row.id)).toEqual(["low-a", "low-b", "high", "empty"]);
    expect(stableSortRows(rows, (row) => row.value, "desc").map((row) => row.id)).toEqual(["high", "low-a", "low-b", "empty"]);
  });
});
