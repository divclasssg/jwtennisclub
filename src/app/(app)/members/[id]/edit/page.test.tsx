import { render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditMemberPage from "./page";

const loadMemberForEdit = vi.fn();
const currentOperatorHasPermission = vi.fn();

vi.mock("@/features/auth/operator-context", () => ({
  currentOperatorHasPermission: (...args: unknown[]) => currentOperatorHasPermission(...args),
}));
vi.mock("@/features/members/member-directory", () => ({
  loadMemberForEdit: (...args: unknown[]) => loadMemberForEdit(...args),
  loadMemberGroups: vi.fn(async () => [
    { id: "group-a", code: "A" },
    { id: "group-b", code: "B" },
  ]),
}));
vi.mock("../../actions", () => ({ updateMember: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  useRouter: () => ({ back: vi.fn() }),
}));

const member = {
  id: "member-1",
  memberCode: "JW-000001",
  name: "김민수",
  phoneDisplay: "010-1234-5678",
  phoneNumber: "01012345678",
  canManageContacts: true,
  groupCode: "A",
  groupId: "group-a",
  status: "active" as const,
  joinedDate: "2026-07-01",
  withdrawnDate: null,
  pauseStartMonth: "2026-08-01",
  memo: "초기 등록",
};

describe("EditMemberPage", () => {
  beforeEach(() => {
    loadMemberForEdit.mockResolvedValue(member);
    currentOperatorHasPermission.mockResolvedValue(true);
  });

  it("renders member code and raw contact for a contact manager", async () => {
    render(await EditMemberPage({
      params: Promise.resolve({ id: "member-1" }),
      searchParams: Promise.resolve({}),
    }));

    expect(screen.getByRole("dialog", { name: "회원 수정" })).toBeInTheDocument();
    expect(screen.getByText("JW-000001")).toBeInTheDocument();
    expect(screen.getByLabelText("연락처")).toHaveValue("01012345678");
    expect(screen.getByLabelText("연락처")).toHaveAttribute("autocomplete", "tel");
    expect(screen.getByLabelText("그룹")).toHaveValue("group-a");
    expect(screen.getByLabelText("휴회 시작 월")).toHaveValue("2026-08");
    expect(screen.queryByText("탈퇴 사유")).not.toBeInTheDocument();
  });

  it("only shows the masked contact without manage permission", async () => {
    loadMemberForEdit.mockResolvedValue({
      ...member,
      phoneDisplay: "010-****-5678",
      phoneNumber: null,
      canManageContacts: false,
    });

    render(await EditMemberPage({
      params: Promise.resolve({ id: "member-1" }),
      searchParams: Promise.resolve({}),
    }));

    expect(screen.queryByLabelText("연락처")).not.toBeInTheDocument();
    expect(screen.getByText("010-****-5678")).toBeInTheDocument();
  });

  it("uses notFound for missing members", async () => {
    loadMemberForEdit.mockResolvedValue(null);
    await expect(EditMemberPage({
      params: Promise.resolve({ id: "missing" }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("uses notFound without member update permission", async () => {
    currentOperatorHasPermission.mockResolvedValue(false);

    await expect(EditMemberPage({
      params: Promise.resolve({ id: "member-1" }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
