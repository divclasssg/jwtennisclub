import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import DashboardError from "./error";

describe("DashboardError", () => {
  it("offers one safe retry without exposing the original exception", () => {
    const reset = vi.fn();

    render(
      <DashboardError
        error={new Error("private database connection detail")}
        reset={reset}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "대시보드를 불러오지 못했습니다",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("private database connection detail")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
