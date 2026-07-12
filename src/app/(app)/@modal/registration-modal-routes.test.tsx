import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import NewExpenseModalPage from "./(.)expenses/new/page";
import NewFeePaymentModalPage from "./(.)fees/new/page";
import NewMemberModalPage from "./(.)members/new/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: vi.fn(),
  }),
}));

vi.mock("@/app/(app)/expenses/actions", () => ({
  createExpense: vi.fn(),
}));

vi.mock("@/app/(app)/fees/actions", () => ({
  importFeePaymentsCsv: vi.fn(),
}));

vi.mock("@/app/(app)/members/actions", () => ({
  createMember: vi.fn(),
}));

vi.mock("@/features/members/member-directory", () => ({
  loadMemberGroups: vi.fn(async () => [{ id: "group-a", code: "A" }]),
}));

describe("registration modal routes", () => {
  it("renders member registration content in a modal", async () => {
    render(
      await NewMemberModalPage({
        searchParams: Promise.resolve({ error: "invalid-phone" }),
      }),
    );

    expect(screen.getByRole("dialog", { name: "회원 등록" })).toBeInTheDocument();
    expect(screen.getByLabelText("이름")).toBeInTheDocument();
    expect(
      screen.getByText("연락처 형식을 확인하세요."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("CSV 파일")).not.toBeInTheDocument();
  });

  it("renders fee CSV registration content in a modal", async () => {
    render(
      await NewFeePaymentModalPage({
        searchParams: Promise.resolve({ importError: "invalid-csv", line: "4" }),
      }),
    );

    expect(
      screen.getByRole("dialog", { name: "회비 CSV 등록" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("CSV 파일")).toBeInTheDocument();
    expect(screen.getByText(/4번째 줄을 확인하세요/)).toBeInTheDocument();
  });

  it("renders expense registration content in a modal", async () => {
    render(
      await NewExpenseModalPage({
        searchParams: Promise.resolve({ error: "receipt-too-large" }),
      }),
    );

    expect(screen.getByRole("dialog", { name: "지출 등록" })).toBeInTheDocument();
    expect(screen.getByLabelText("사용일")).toBeInTheDocument();
    expect(screen.getByText("영수증 파일은 10MB 이하로 첨부하세요.")).toBeInTheDocument();
  });
});
