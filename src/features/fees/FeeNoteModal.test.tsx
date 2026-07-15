import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FeeNoteModal } from "./FeeNoteModal";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), replace: vi.fn() }),
}));

describe("FeeNoteModal", () => {
  const action = async () => {};

  it("renders the selected member note and preserved list state", () => {
    render(
      <FeeNoteModal
        action={action}
        closeHref="/fees?month=2026-07&q=%EA%B9%80&sort=memo&direction=desc"
        direction="desc"
        errorCode=""
        memberId="member-1"
        memberName="김민수"
        memo="다음 달 합산"
        periodMonth="2026-07-01"
        query="김"
        sort="memo"
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "김민수 2026.07 회비 메모" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("메모")).toHaveValue("다음 달 합산");
    expect(screen.getByLabelText("메모")).toHaveAttribute("maxlength", "500");
    expect(screen.getByDisplayValue("member-1")).toHaveAttribute(
      "name",
      "memberId",
    );
    expect(screen.getByRole("link", { name: "취소" })).toHaveAttribute(
      "href",
      "/fees?month=2026-07&q=%EA%B9%80&sort=memo&direction=desc",
    );
  });

  it("connects a validation error to the textarea", () => {
    render(
      <FeeNoteModal
        action={action}
        closeHref="/fees?month=2026-07"
        direction=""
        errorCode="too-long"
        memberId="member-1"
        memberName="김민수"
        memo=""
        periodMonth="2026-07-01"
        query=""
        sort=""
      />,
    );

    const message = screen.getByRole("alert");
    expect(message).toHaveTextContent("메모는 500자 이하로 입력하세요.");
    expect(screen.getByLabelText("메모")).toHaveAttribute(
      "aria-describedby",
      message.id,
    );
  });
});
