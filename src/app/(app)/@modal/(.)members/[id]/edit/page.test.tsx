import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EditMemberModalPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn() }),
}));

vi.mock("@/app/(app)/members/[id]/edit/EditMemberContent", () => ({
  EditMemberContent: vi.fn(async () => <p>김민수 회원 정보</p>),
}));

describe("EditMemberModalPage", () => {
  it("renders shared member edit content in a modal", async () => {
    render(await EditMemberModalPage({
      params: Promise.resolve({ id: "member-1" }),
      searchParams: Promise.resolve({}),
    }));

    expect(screen.getByRole("dialog", { name: "회원 수정" })).toBeInTheDocument();
    expect(screen.getByText("김민수 회원 정보")).toBeInTheDocument();
  });
});
