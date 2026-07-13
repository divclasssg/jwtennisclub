import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MembersPage from "./page";

const loadMemberDirectory = vi.fn();
const hasCurrentUserPermission = vi.fn();

vi.mock("@/features/members/member-directory", () => ({
  hasCurrentUserPermission: (...args: unknown[]) => hasCurrentUserPermission(...args),
  loadMemberDirectory: (...args: unknown[]) => loadMemberDirectory(...args),
}));

const member = {
  id: "member-1",
  memberCode: "JW-000001",
  name: "김민수",
  operatorProfileId: "profile-id",
  clubPositionLabel: "총무",
  phoneDisplay: "010-****-5678",
  groupCode: "A",
  status: "active" as const,
  joinedDate: "2026-07-01",
  withdrawnDate: null,
  memo: null,
};

describe("MembersPage", () => {
  beforeEach(() => {
    loadMemberDirectory.mockResolvedValue([member]);
    hasCurrentUserPermission.mockResolvedValue(true);
  });

  it("renders permanent member data without a group search filter", async () => {
    render(
      await MembersPage({
        searchParams: Promise.resolve({ q: "JW", status: "active" }),
      }),
    );

    expect(screen.getByLabelText("검색")).toHaveAttribute(
      "placeholder",
      "이름 또는 회원번호",
    );
    expect(screen.queryByLabelText("그룹")).not.toBeInTheDocument();
    expect(loadMemberDirectory).toHaveBeenCalledWith({
      q: "JW",
      status: "active",
    });

    expect(screen.getByRole("link", { name: "휴회" })).toHaveAttribute(
      "href",
      "/members?status=paused&q=JW",
    );

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "회원번호↑↓",
      "이름↑↓",
      "전화번호↑↓",
      "구분↑↓",
      "직책↑↓",
      "그룹↑↓",
      "상태↑↓",
      "가입일↑↓",
      "관리",
    ]);
    expect(within(table).getByRole("cell", { name: "운영진" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "총무" })).toBeInTheDocument();
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

  it("sorts members from header links while preserving member filters", async () => {
    loadMemberDirectory.mockResolvedValue([
      member,
      { ...member, id: "member-2", memberCode: "JW-000002", name: "박지수" },
    ]);

    render(await MembersPage({
      searchParams: Promise.resolve({
        q: "JW",
        status: "active",
        sort: "name",
        direction: "desc",
      }),
    }));

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual(["박지수", "김민수"]);
    expect(screen.getByRole("link", { name: "이름 내림차순 정렬" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "가입일 오름차순 정렬" })).toHaveAttribute(
      "href",
      "/members?q=JW&status=active&sort=joinedDate&direction=asc",
    );
    expect(screen.queryByRole("link", { name: "관리 오름차순 정렬" })).not.toBeInTheDocument();

    const mobileList = screen.getByRole("list", { name: "모바일 회원 목록" });
    expect(within(mobileList).getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["박지수", "김민수"]);
  });

  it("shows 일반회원 in the position column for a non-operator member", async () => {
    loadMemberDirectory.mockResolvedValue([
      { ...member, operatorProfileId: null, clubPositionLabel: null },
    ]);

    render(await MembersPage({ searchParams: Promise.resolve({}) }));

    const table = screen.getByRole("table");
    expect(within(table).getByRole("cell", { name: "-" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "일반회원" })).toBeInTheDocument();
    const mobileList = screen.getByRole("list", { name: "모바일 회원 목록" });
    expect(within(mobileList).getByText("구분 -")).toBeInTheDocument();
    expect(within(mobileList).getByText("직책 일반회원")).toBeInTheDocument();
  });

  it("renders member code, group, and protected contact on mobile", async () => {
    render(await MembersPage({ searchParams: Promise.resolve({}) }));

    const mobileList = screen.getByRole("list", { name: "모바일 회원 목록" });
    expect(within(mobileList).getByText("회원번호 JW-000001")).toBeInTheDocument();
    expect(within(mobileList).getByText("연락처 010-****-5678")).toBeInTheDocument();
    expect(within(mobileList).getByText("그룹 A")).toBeInTheDocument();
    expect(within(mobileList).getByText("구분 운영진")).toBeInTheDocument();
    expect(within(mobileList).getByText("직책 총무")).toBeInTheDocument();
  });

  it("hides member management links without create and update permissions", async () => {
    hasCurrentUserPermission.mockImplementation(async (permission: string) =>
      permission !== "members.create" && permission !== "members.update"
    );

    render(await MembersPage({ searchParams: Promise.resolve({}) }));

    expect(screen.queryByRole("link", { name: "회원 등록" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "수정" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "김민수 수정" })).not.toBeInTheDocument();
  });
});
