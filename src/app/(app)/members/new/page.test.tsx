import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import NewMemberPage from "./page";

vi.mock("../actions", () => ({
  createMember: vi.fn(),
  importMembersCsv: vi.fn(),
}));

describe("NewMemberPage", () => {
  it("renders single member and CSV registration forms", async () => {
    render(
      await NewMemberPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "새 회원 추가" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("이름")).toBeInTheDocument();
    expect(screen.getByLabelText("전화번호 끝 4자리")).toBeInTheDocument();
    expect(screen.getByLabelText("CSV 파일")).toBeInTheDocument();

    const csvSection = screen.getByRole("heading", { name: "CSV 등록" })
      .parentElement?.parentElement;

    expect(csvSection).not.toBeNull();
    expect(
      within(csvSection as HTMLElement).getByRole("button", {
        name: "CSV 등록",
      }),
    ).toBeInTheDocument();
  });

  it("renders validation messages from query params", async () => {
    render(
      await NewMemberPage({
        searchParams: Promise.resolve({
          error: "invalid-phone",
          importError: "invalid-csv",
          line: "3",
        }),
      }),
    );

    expect(
      screen.getByText("전화번호는 끝 4자리 숫자만 입력하세요."),
    ).toBeInTheDocument();
    expect(screen.getByText(/3번째 줄을 확인하세요/)).toBeInTheDocument();
  });
});
