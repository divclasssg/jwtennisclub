import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ReportsPage from "./page";

describe("ReportsPage", () => {
  it("renders monthly report controls with a PDF download link", async () => {
    render(
      await ReportsPage({
        searchParams: Promise.resolve({ month: "2026-06" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "월간 PDF 보고서" })).toBeInTheDocument();
    expect(screen.getByLabelText("보고서 월")).toHaveValue("2026-06");
    expect(screen.getByRole("link", { name: "PDF 다운로드" })).toHaveAttribute(
      "href",
      "/reports/monthly?month=2026-06",
    );
  });
});
