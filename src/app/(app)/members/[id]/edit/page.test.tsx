import { render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditMemberPage from "./page";

type MemberDatabaseFixture = {
  id: string;
  name: string;
  phone_last_four: string | null;
  status: "active" | "paused" | "withdrawn";
  joined_date: string;
  withdrawn_date: string | null;
  withdrawal_reason: string | null;
  memo: string | null;
};

const queryState: { row: MemberDatabaseFixture | null } = {
  row: {
    id: "member-1",
    name: "김민수",
    phone_last_four: "1234",
    status: "active",
    joined_date: "2026-07-01",
    withdrawn_date: null,
    withdrawal_reason: null,
    memo: "초기 등록",
  },
};

const queryBuilder = {
  select: vi.fn(() => queryBuilder),
  eq: vi.fn(() => queryBuilder),
  maybeSingle: vi.fn(() => Promise.resolve({ data: queryState.row, error: null })),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => queryBuilder),
  })),
}));

vi.mock("../../actions", () => ({
  updateMember: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

describe("EditMemberPage", () => {
  beforeEach(() => {
    queryState.row = {
      id: "member-1",
      name: "김민수",
      phone_last_four: "1234",
      status: "active",
      joined_date: "2026-07-01",
      withdrawn_date: null,
      withdrawal_reason: null,
      memo: "초기 등록",
    };
    queryBuilder.select.mockClear();
    queryBuilder.eq.mockClear();
    queryBuilder.maybeSingle.mockClear();
  });

  it("renders an edit form with existing member values", async () => {
    render(
      await EditMemberPage({
        params: Promise.resolve({ id: "member-1" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole("heading", { name: "회원 수정" })).toBeInTheDocument();
    expect(screen.getByLabelText("전화번호 끝 4자리")).toHaveValue("1234");
    expect(screen.getByLabelText("메모")).toHaveValue("초기 등록");
  });

  it("uses notFound for missing members", async () => {
    queryState.row = null;

    await expect(
      EditMemberPage({
        params: Promise.resolve({ id: "missing" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
