import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import NewExpenseModalPage from "./(.)expenses/new/page";
import NewFeePaymentModalPage from "./(.)fees/new/page";
import NewMemberModalPage from "./(.)members/new/page";

const lockMocks = vi.hoisted(() => ({
  getMonthlySourceLockStatus: vi.fn(async () => false),
}));

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

vi.mock("@/features/settlements/monthly-source-lock", () => ({
  getMonthlySourceLockStatus: lockMocks.getMonthlySourceLockStatus,
}));

vi.mock("@/features/members/member-directory", () => ({
  canManageMemberContacts: vi.fn(async () => false),
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
    expect(screen.queryByLabelText("연락처")).not.toBeInTheDocument();
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

  it("suppresses intercepted expense creation for a finalized month", async () => {
    lockMocks.getMonthlySourceLockStatus.mockResolvedValueOnce(true);

    render(
      await NewExpenseModalPage({
        searchParams: Promise.resolve({ month: "2026-07" }),
      }),
    );

    expect(screen.getByRole("dialog", { name: "지출 등록" }))
      .toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "최종 마감된 월입니다. 회비와 지출을 수정하려면 먼저 결산을 재개하세요.",
    );
    expect(screen.queryByRole("button", { name: "지출 등록" }))
      .not.toBeInTheDocument();
    expect(lockMocks.getMonthlySourceLockStatus).toHaveBeenCalledWith(
      "2026-07-01",
    );
  });
});
