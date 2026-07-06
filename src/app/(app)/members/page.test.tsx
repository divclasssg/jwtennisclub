import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MembersPage from "./page";

const members = [
  {
    id: "member-1",
    name: "김민수",
    phone_last_four: "1234",
    operator_profile_id: "profile-id",
    status: "active",
    joined_date: "2026-07-01",
    withdrawn_date: null,
    withdrawal_reason: null,
    memo: null,
  },
  {
    id: "member-2",
    name: "이영희",
    phone_last_four: "9876",
    operator_profile_id: null,
    status: "withdrawn",
    joined_date: "2026-06-01",
    withdrawn_date: "2026-07-10",
    withdrawal_reason: "이사",
    memo: null,
  },
];

const queryState = {
  rows: members,
  profileRows: [
    {
      id: "profile-id",
      club_positions: {
        name: "president",
        sort_order: 10,
      },
    },
  ],
};

function createQueryBuilder(
  resolver: () => {
    data: unknown[];
    error: null;
  },
) {
  const queryBuilder = {
    select: vi.fn(() => queryBuilder),
    order: vi.fn(() => queryBuilder),
    eq: vi.fn(() => queryBuilder),
    in: vi.fn(() => queryBuilder),
    or: vi.fn(() => queryBuilder),
    then: vi.fn((resolve) => resolve(resolver())),
  };

  return queryBuilder;
}

const membersQueryBuilder = createQueryBuilder(() => ({
  data: queryState.rows,
  error: null,
}));
const profilesQueryBuilder = createQueryBuilder(() => ({
  data: queryState.profileRows,
  error: null,
}));
const from = vi.fn((table: string) =>
  table === "profiles" ? profilesQueryBuilder : membersQueryBuilder,
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from,
  })),
}));

describe("MembersPage", () => {
  beforeEach(() => {
    queryState.rows = members;
    queryState.profileRows = [
      {
        id: "profile-id",
        club_positions: {
          name: "president",
          sort_order: 10,
        },
      },
    ];
    from.mockClear();

    for (const queryBuilder of [membersQueryBuilder, profilesQueryBuilder]) {
      queryBuilder.select.mockClear();
      queryBuilder.order.mockClear();
      queryBuilder.eq.mockClear();
      queryBuilder.in.mockClear();
      queryBuilder.or.mockClear();
      queryBuilder.then.mockClear();
    }
  });

  it("renders member rows with search and status tabs", async () => {
    render(
      await MembersPage({
        searchParams: Promise.resolve({ q: "김", status: "paused" }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "회원 관리" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("검색")).toHaveValue("김");
    expect(screen.getByDisplayValue("paused")).toHaveAttribute("name", "status");
    expect(
      screen.getByRole("link", { name: "활동" }),
    ).toHaveAttribute("href", "/members?status=active&q=%EA%B9%80");
    expect(
      screen.getByRole("link", { name: "휴회" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: "탈퇴" }),
    ).toHaveAttribute("href", "/members?status=withdrawn&q=%EA%B9%80");

    const list = screen.getByRole("region", { name: "회원 목록" });
    const table = within(list).getByRole("table");
    expect(within(list).getByText("총 2명")).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "1234" })).toBeInTheDocument();
    expect(within(table).getByText("운영진")).toBeInTheDocument();
    expect(within(table).getByText("일반회원")).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "2026.07.10" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "이사" })).toBeInTheDocument();
  });

  it("renders a mobile member list with the same member details", async () => {
    render(
      await MembersPage({
        searchParams: Promise.resolve({ status: "active" }),
      }),
    );

    const mobileList = screen.getByRole("list", { name: "모바일 회원 목록" });
    const items = within(mobileList).getAllByRole("listitem");

    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole("heading", { name: "김민수" })).toBeInTheDocument();
    expect(within(items[0]).getByText("연락처 1234")).toBeInTheDocument();
    expect(within(items[0]).getByText("운영진")).toBeInTheDocument();
    expect(
      within(items[0]).getByRole("link", { name: "김민수 수정" }),
    ).toHaveAttribute("href", "/members/member-1/edit");
    expect(within(items[1]).getByText("탈퇴일 2026.07.10")).toBeInTheDocument();
    expect(within(items[1]).getByText("탈퇴 사유 이사")).toBeInTheDocument();
  });

  it("renders an empty state when no members match", async () => {
    queryState.rows = [];

    render(
      await MembersPage({
        searchParams: Promise.resolve({ q: "없음", status: "active" }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "표시할 회원이 없습니다" }),
    ).toBeInTheDocument();
  });
});
