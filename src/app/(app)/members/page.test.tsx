import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MembersPage from "./page";

const loadMemberDirectory = vi.fn();

vi.mock("@/features/members/member-directory", () => ({
  loadMemberDirectory: (...args: unknown[]) => loadMemberDirectory(...args),
}));

const member = {
  id: "member-1",
  memberCode: "JW-000001",
  name: "김민수",
  phoneDisplay: "010-****-5678",
  groupCode: "A",
  status: "active" as const,
  joinedDate: "2026-07-01",
  withdrawnDate: null,
  memo: null,
};

describe("MembersPage", () => {
  beforeEach(() => loadMemberDirectory.mockResolvedValue([member]));

  it("renders permanent member data and directory filters", async () => {
    render(
      await MembersPage({
        searchParams: Promise.resolve({ q: "JW", status: "active", group: "A" }),
      }),
    );

    expect(screen.getByLabelText("검색")).toHaveAttribute(
      "placeholder",
      "이름 또는 회원번호 검색",
    );
    expect(screen.getByLabelText("그룹")).toHaveValue("A");
    expect(loadMemberDirectory).toHaveBeenCalledWith({
      q: "JW",
      status: "active",
      group: "A",
    });

    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "회원번호" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "그룹" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "JW-000001" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "010-****-5678" })).toBeInTheDocument();
    expect(screen.queryByText("탈퇴 사유")).not.toBeInTheDocument();
  });

  it("renders the full contact returned for a contact manager", async () => {
    loadMemberDirectory.mockResolvedValue([
      { ...member, phoneDisplay: "010-1234-5678" },
    ]);

    render(await MembersPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("010-1234-5678")).toBeInTheDocument();
  });

  it("renders member code, group, and protected contact on mobile", async () => {
    render(await MembersPage({ searchParams: Promise.resolve({}) }));

    const mobileList = screen.getByRole("list", { name: "모바일 회원 목록" });
    expect(within(mobileList).getByText("회원번호 JW-000001")).toBeInTheDocument();
    expect(within(mobileList).getByText("연락처 010-****-5678")).toBeInTheDocument();
    expect(within(mobileList).getByText("그룹 A")).toBeInTheDocument();
  });
});
