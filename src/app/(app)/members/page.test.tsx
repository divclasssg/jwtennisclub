import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MembersPage from "./page";

const members = [
  {
    id: "member-1",
    name: "김민수",
    phone_last_four: "1234",
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
    status: "withdrawn",
    joined_date: "2026-06-01",
    withdrawn_date: "2026-07-10",
    withdrawal_reason: "이사",
    memo: null,
  },
];

const queryState = {
  rows: members,
};

const queryBuilder = {
  select: vi.fn(() => queryBuilder),
  order: vi.fn(() => queryBuilder),
  eq: vi.fn(() => queryBuilder),
  or: vi.fn(() => queryBuilder),
  then: vi.fn((resolve) => resolve({ data: queryState.rows, error: null })),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => queryBuilder),
  })),
}));

describe("MembersPage", () => {
  beforeEach(() => {
    queryState.rows = members;
    queryBuilder.select.mockClear();
    queryBuilder.order.mockClear();
    queryBuilder.eq.mockClear();
    queryBuilder.or.mockClear();
    queryBuilder.then.mockClear();
  });

  it("renders member rows with search and status filters", async () => {
    render(
      await MembersPage({
        searchParams: Promise.resolve({ q: "김", status: "active" }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "회원 목록" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("검색")).toHaveValue("김");
    expect(screen.getByLabelText("상태")).toHaveValue("active");

    const list = screen.getByRole("region", { name: "회원 목록" });
    expect(within(list).getByText("총 2명")).toBeInTheDocument();
    expect(within(list).getByRole("cell", { name: "1234" })).toBeInTheDocument();
    expect(within(list).getByRole("cell", { name: "2026.07.10" })).toBeInTheDocument();
    expect(within(list).getByRole("cell", { name: "이사" })).toBeInTheDocument();
  });

  it("renders an empty state when no members match", async () => {
    queryState.rows = [];

    render(
      await MembersPage({
        searchParams: Promise.resolve({ q: "없음", status: "all" }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "표시할 회원이 없습니다" }),
    ).toBeInTheDocument();
  });
});
