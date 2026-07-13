import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditMemberModalPage from "./page";

const editMemberContentMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn() }),
}));

vi.mock("@/app/(app)/members/[id]/edit/EditMemberContent", () => ({
  EditMemberContent: (props: unknown) => editMemberContentMock(props),
}));

describe("EditMemberModalPage", () => {
  beforeEach(() => {
    editMemberContentMock.mockReset();
    editMemberContentMock.mockReturnValue(<p>김민수 회원 정보</p>);
  });

  it("renders shared member edit content in a modal", async () => {
    render(await EditMemberModalPage({
      params: Promise.resolve({ id: "member-1" }),
      searchParams: Promise.resolve({}),
    }));

    expect(screen.getByRole("dialog", { name: "회원 수정" })).toBeInTheDocument();
    expect(screen.getByText("김민수 회원 정보")).toBeInTheDocument();
  });

  it("renders the modal shell while member data is pending", () => {
    editMemberContentMock.mockReturnValueOnce(new Promise(() => undefined));

    const result = EditMemberModalPage({
      params: Promise.resolve({ id: "member-1" }),
      searchParams: Promise.resolve({}),
    });

    expect(result).not.toBeInstanceOf(Promise);

    render(result as ReactElement);

    expect(screen.getByRole("dialog", { name: "회원 수정" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "회원 정보를 불러오는 중입니다.",
    );
  });
});
