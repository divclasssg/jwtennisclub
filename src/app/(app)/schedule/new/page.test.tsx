import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import NewEventPage from "./page";

vi.mock("../actions", () => ({
  createEvent: vi.fn(),
}));

describe("NewEventPage", () => {
  it("renders the schedule event form", () => {
    render(<NewEventPage />);

    expect(screen.getByRole("heading", { name: "일정 등록" })).toBeInTheDocument();
    expect(screen.getByLabelText("일정 날짜")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("일정 시간")).toHaveAttribute("type", "time");
    expect(screen.getByLabelText("일정 이름")).toBeInTheDocument();
    expect(screen.getByLabelText("장소")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "일정 등록" })).toBeInTheDocument();
  });
});
