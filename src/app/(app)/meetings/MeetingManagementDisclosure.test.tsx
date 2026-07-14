import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { MeetingManagementDisclosure } from "./MeetingManagementDisclosure";

function PendingChild() {
  const [pending, setPending] = useState(false);

  return (
    <button onClick={() => setPending(true)} type="button">
      {pending ? "처리 중" : "처리 시작"}
    </button>
  );
}

describe("MeetingManagementDisclosure", () => {
  it("starts closed and connects its toggle to the labelled region", () => {
    render(
      <MeetingManagementDisclosure meetingTitle="7월 1차 정모">
        <span>관리 내용</span>
      </MeetingManagementDisclosure>,
    );

    const toggle = screen.getByRole("button", {
      name: "7월 1차 정모 관리 열기",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("관리 내용")).not.toBeVisible();

    fireEvent.click(toggle);

    const region = screen.getByRole("region", {
      name: "7월 1차 정모 회차 관리",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", region.id);
    expect(toggle).toHaveAccessibleName("7월 1차 정모 관리 닫기");
    expect(region).toHaveTextContent("관리 내용");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAccessibleName("7월 1차 정모 관리 열기");
    expect(screen.queryByRole("region", {
      name: "7월 1차 정모 회차 관리",
    })).not.toBeInTheDocument();
  });

  it("preserves child state while closed without exposing its controls", () => {
    render(
      <MeetingManagementDisclosure meetingTitle="7월 1차 정모">
        <PendingChild />
      </MeetingManagementDisclosure>,
    );

    const toggle = screen.getByRole("button", {
      name: "7월 1차 정모 관리 열기",
    });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "처리 시작" }));

    fireEvent.click(toggle);

    expect(screen.queryByRole("button", { name: "처리 중" }))
      .not.toBeInTheDocument();
    expect(screen.getByText("처리 중")).not.toBeVisible();

    fireEvent.click(toggle);

    expect(screen.getByRole("button", { name: "처리 중" })).toBeVisible();
  });
});
