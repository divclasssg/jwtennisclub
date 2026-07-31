import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DashboardPage from "./page";

describe("DashboardPage", () => {
  it("renders dense Korean operational placeholder metrics", () => {
    render(<DashboardPage />);

    const metrics = screen.getByRole("region", { name: "월간 운영 지표" });

    expect(within(metrics).getByText("회비 수입", { selector: "dt" })).toBeInTheDocument();
    expect(within(metrics).getByText("운영비 지출", { selector: "dt" })).toBeInTheDocument();
    expect(within(metrics).getByText("미납 회원", { selector: "dt" })).toBeInTheDocument();
    expect(within(metrics).getByText("결산 상태", { selector: "dt" })).toBeInTheDocument();
    expect(within(metrics).getByText("진행 중")).toBeInTheDocument();
    expect(screen.getByText("결산").closest("a")).toHaveAttribute(
      "href",
      "/settlements",
    );
    expect(screen.getByText(/회원, 회비, 지출, 결산 흐름/)).toBeInTheDocument();
  });
});
