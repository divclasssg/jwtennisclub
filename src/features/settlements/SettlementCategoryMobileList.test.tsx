import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SettlementExpenseCategoryRow } from "./settlement-summary";
import { SettlementCategoryMobileList } from "./SettlementCategoryMobileList";

const rows: SettlementExpenseCategoryRow[] = [
  {
    category: "court",
    count: 2,
    amount: 120000,
  },
];

describe("SettlementCategoryMobileList", () => {
  it("renders the category, count, and amount", () => {
    render(<SettlementCategoryMobileList rows={rows} />);

    const list = screen.getByRole("list", {
      name: "모바일 카테고리별 지출",
    });

    expect(
      within(list).getByRole("heading", { name: "코트" }),
    ).toBeInTheDocument();
    expect(within(list).getByText("2건")).toBeInTheDocument();
    expect(within(list).getByText("120,000원")).toBeInTheDocument();
  });
});
