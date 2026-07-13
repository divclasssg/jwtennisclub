import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemberForm } from "./MemberForm";

describe("MemberForm presentation", () => {
  it("shows field labels and useful text placeholders", () => {
    render(
      <MemberForm
        action={vi.fn(async () => ({ status: "idle" as const }))}
        canManageContacts
        groups={[{ id: "group-a", code: "A" }]}
        mode="create"
      />,
    );

    for (const label of ["이름", "연락처", "그룹", "가입일", "상태", "탈퇴일", "메모"]) {
      expect(screen.getByText(label).className).toContain("form-field-label-visible");
    }
    expect(screen.getByLabelText("이름")).toHaveAttribute("placeholder", "홍길동");
    expect(screen.getByLabelText("연락처")).toHaveAttribute(
      "placeholder",
      "010-1234-5678",
    );
    expect(screen.getByLabelText("메모")).toHaveAttribute(
      "placeholder",
      "특이사항을 입력하세요",
    );
  });
});
