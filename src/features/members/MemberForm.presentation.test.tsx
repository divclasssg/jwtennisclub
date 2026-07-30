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

    for (const label of ["이름", "연락처", "그룹", "가입일", "활동 시작 월", "상태", "휴회 시작 월", "탈퇴일", "메모"]) {
      expect(screen.getByText(label).className).toContain("form-field-label-visible");
    }
    expect(screen.getByLabelText("휴회 시작 월")).toHaveAttribute("type", "month");
    expect(screen.getByLabelText("활동 시작 월")).toHaveAttribute("type", "month");
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

  it("uses the saved pause start month as the edit default", () => {
    render(
      <MemberForm
        action={vi.fn(async () => ({ status: "idle" as const }))}
        groups={[]}
        member={{
          id: "member-id",
          memberCode: "JW-000001",
          name: "김민수",
          operatorProfileId: null,
          clubPositionLabel: null,
          phoneDisplay: "010-****-5678",
          groupCode: null,
          status: "paused",
          joinedDate: "2026-07-01",
          withdrawnDate: null,
          pauseStartMonth: "2026-08-01",
          memo: null,
          phoneNumber: null,
          groupId: null,
          canManageContacts: false,
        }}
        mode="edit"
      />,
    );

    expect(screen.getByLabelText("휴회 시작 월")).toHaveValue("2026-08");
    expect(screen.getByLabelText("활동 시작 월")).toHaveValue("");
    expect(screen.getByLabelText("활동 시작 월")).toHaveAttribute("min", "2026-07");
  });
});
