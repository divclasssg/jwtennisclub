import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DashboardPage from "./page";

describe("DashboardPage", () => {
  it("renders dense Korean operational placeholder metrics", () => {
    render(<DashboardPage />);

    expect(
      screen.getByRole("heading", { name: "운영 대시보드" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2026년 7월")).toBeInTheDocument();
    expect(screen.getByText("회비 수입")).toBeInTheDocument();
    expect(screen.getByText("운영비 지출")).toBeInTheDocument();
    expect(screen.getByText("미납 회원")).toBeInTheDocument();
    expect(screen.getByText("정산 상태")).toBeInTheDocument();
    expect(screen.getByText("진행 중")).toBeInTheDocument();
  });
});
