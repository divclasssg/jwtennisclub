import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SortableTableHeader } from "./SortableTableHeader";

describe("SortableTableHeader", () => {
  it("renders one active ascending header link that switches to descending", () => {
    render(
      <table><thead><tr><SortableTableHeader
        label="회원번호"
        pathname="/members"
        searchParams={{ q: "김" }}
        sortKey="memberCode"
        sortState={{ key: "memberCode", direction: "asc" }}
      /></tr></thead></table>,
    );

    const header = screen.getByRole("columnheader", { name: "회원번호 내림차순 정렬" });
    const link = screen.getByRole("link", { name: "회원번호 내림차순 정렬" });

    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(link).toHaveAttribute("aria-current", "true");
    expect(link).toHaveAttribute("href", "/members?q=%EA%B9%80&sort=memberCode&direction=desc");
    expect(link).toHaveTextContent(/회원번호\s*↑/);
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("renders an active descending header link that switches to ascending", () => {
    render(
      <table><thead><tr><SortableTableHeader
        label="금액"
        pathname="/expenses"
        searchParams={{ month: "2026-07" }}
        sortKey="amount"
        sortState={{ key: "amount", direction: "desc" }}
      /></tr></thead></table>,
    );

    const header = screen.getByRole("columnheader", { name: "금액 오름차순 정렬" });
    const link = screen.getByRole("link", { name: "금액 오름차순 정렬" });

    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(link).toHaveAttribute("href", "/expenses?month=2026-07&sort=amount&direction=asc");
    expect(link).toHaveTextContent(/금액\s*↓/);
  });

  it("renders an inactive header with a neutral arrow that starts ascending", () => {
    render(
      <table><thead><tr><SortableTableHeader
        label="이름"
        pathname="/members"
        searchParams={{ q: "김", status: "active" }}
        sortKey="name"
        sortState={{ key: "memberCode", direction: "desc" }}
      /></tr></thead></table>,
    );

    const header = screen.getByRole("columnheader", { name: "이름 오름차순 정렬" });
    const link = screen.getByRole("link", { name: "이름 오름차순 정렬" });

    expect(header).not.toHaveAttribute("aria-sort");
    expect(link).not.toHaveAttribute("aria-current");
    expect(link).toHaveAttribute("href", "/members?q=%EA%B9%80&status=active&sort=name&direction=asc");
    expect(link).toHaveTextContent(/이름\s*↕/);
  });
});
