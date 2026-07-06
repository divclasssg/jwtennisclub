import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import NewExpensePage from "./page";

vi.mock("../actions", () => ({
  createExpense: vi.fn(),
}));

describe("NewExpensePage", () => {
  it("renders the expense creation form", async () => {
    render(
      await NewExpensePage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole("heading", { name: "지출 관리" })).toBeInTheDocument();
    expect(screen.getByLabelText("사용일")).toBeInTheDocument();
    expect(screen.getByLabelText("카테고리")).toBeInTheDocument();
    expect(screen.getByLabelText("내용")).toBeInTheDocument();
    expect(screen.getByLabelText("금액")).toBeInTheDocument();
    expect(screen.queryByLabelText("증빙 있음")).not.toBeInTheDocument();
    expect(screen.getByLabelText("영수증 파일")).toHaveAttribute("type", "file");
    expect(screen.getByRole("button", { name: "지출 등록" })).toBeInTheDocument();
  });

  it("renders receipt upload validation errors", async () => {
    render(
      await NewExpensePage({
        searchParams: Promise.resolve({ error: "receipt-too-large" }),
      }),
    );

    expect(screen.getByText("영수증 파일은 10MB 이하로 첨부하세요.")).toBeInTheDocument();
  });
});
