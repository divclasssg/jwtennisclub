import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SortableTableHeader } from "./SortableTableHeader";

describe("SortableTableHeader", () => {
  it("always renders ascending and descending links and marks the active direction", () => {
    render(
      <table><thead><tr><SortableTableHeader
        label="회원번호"
        pathname="/members"
        searchParams={{ q: "김" }}
        sortKey="memberCode"
        sortState={{ key: "memberCode", direction: "asc" }}
      /></tr></thead></table>,
    );

    expect(screen.getByRole("link", { name: "회원번호 오름차순 정렬" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "회원번호 내림차순 정렬" })).toHaveAttribute("href", "/members?q=%EA%B9%80&sort=memberCode&direction=desc");
    expect(screen.getByText("↑")).toBeVisible();
    expect(screen.getByText("↓")).toBeVisible();
  });
});
