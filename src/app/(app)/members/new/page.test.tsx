import { render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewMemberPage from "./page";

const currentOperatorHasPermission = vi.fn();

vi.mock("../actions", () => ({ createMember: vi.fn() }));
vi.mock("@/features/auth/operator-context", () => ({
  currentOperatorHasPermission: (...args: unknown[]) => currentOperatorHasPermission(...args),
}));
vi.mock("@/features/members/member-directory", () => ({
  canManageMemberContacts: vi.fn(async () => false),
  loadMemberGroups: vi.fn(async () => [
    { id: "group-a", code: "A" },
    { id: "group-b", code: "B" },
  ]),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

describe("NewMemberPage", () => {
  beforeEach(() => currentOperatorHasPermission.mockImplementation(async (permission: string) => permission !== "members.contacts.manage"));

  it("renders the protected member form without CSV import", async () => {
    render(await NewMemberPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("회원번호는 등록 시 자동 발급됩니다.")).toBeInTheDocument();
    expect(screen.queryByLabelText("회원번호")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("연락처")).not.toBeInTheDocument();
    expect(screen.getByLabelText("그룹")).toBeInTheDocument();
    expect(screen.queryByText("탈퇴 사유")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("CSV 파일")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "CSV 등록" })).not.toBeInTheDocument();
  });

  it("renders an explicit duplicate confirmation", async () => {
    render(
      await NewMemberPage({
        searchParams: Promise.resolve({ duplicate: "phone-reuse" }),
      }),
    );

    expect(screen.getByText("같은 연락처가 다른 이름으로 등록되어 있습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "확인 후 등록" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("phone-reuse")).toHaveAttribute(
      "name",
      "duplicateConfirmation",
    );
  });

  it("renders the stable activity-start validation message", async () => {
    render(
      await NewMemberPage({
        searchParams: Promise.resolve({
          error: "invalid-activity-start-month",
        }),
      }),
    );

    expect(
      screen.getByText(
        "활동 시작 월은 필수이며 가입 월 또는 그 이후여야 합니다.",
      ),
    ).toBeInTheDocument();
  });

  it("uses notFound without member create permission", async () => {
    currentOperatorHasPermission.mockResolvedValue(false);

    await expect(NewMemberPage({ searchParams: Promise.resolve({}) }))
      .rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
