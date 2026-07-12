import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import NewMemberPage from "./page";

vi.mock("../actions", () => ({ createMember: vi.fn() }));
vi.mock("@/features/members/member-directory", () => ({
  loadMemberGroups: vi.fn(async () => [
    { id: "group-a", code: "A" },
    { id: "group-b", code: "B" },
  ]),
}));

describe("NewMemberPage", () => {
  it("renders the protected member form without CSV import", async () => {
    render(await NewMemberPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("회원번호는 등록 시 자동 발급됩니다.")).toBeInTheDocument();
    expect(screen.queryByLabelText("회원번호")).not.toBeInTheDocument();
    expect(screen.getByLabelText("연락처")).toHaveAttribute("autocomplete", "tel");
    expect(screen.getByLabelText("연락처")).toHaveAttribute("type", "tel");
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
});
