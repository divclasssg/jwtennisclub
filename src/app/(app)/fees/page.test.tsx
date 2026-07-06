import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import FeesPage from "./page";

const payments = [
  {
    id: "payment-1",
    member_id: "member-1",
    period_month: "2026-07-01",
    amount: 30000,
    paid_date: "2026-07-03",
    memo: "입금 확인",
    created_by: "operator-id",
    updated_by: "operator-id",
    created_at: "2026-07-03T00:00:00Z",
    updated_at: "2026-07-03T00:00:00Z",
    members: {
      name: "김민수",
      phone_last_four: "1234",
    },
  },
];

const members = [
  {
    id: "member-1",
    name: "김민수",
    phone_last_four: "1234",
    operator_profile_id: "profile-treasurer",
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
    operator_profile_id: "profile-president",
    status: "active",
    joined_date: "2026-07-01",
    withdrawn_date: null,
    withdrawal_reason: null,
    memo: null,
  },
];

const queryState = {
  payments,
  members,
  profileRows: [
    {
      id: "profile-treasurer",
      club_positions: {
        name: "treasurer",
        sort_order: 30,
      },
    },
    {
      id: "profile-president",
      club_positions: {
        name: "president",
        sort_order: 10,
      },
    },
  ],
};

function createQueryBuilder() {
  const queryBuilder = {
    select: vi.fn(() => queryBuilder),
    eq: vi.fn(() => queryBuilder),
    lte: vi.fn(() => queryBuilder),
    order: vi.fn(() => queryBuilder),
    in: vi.fn(() => queryBuilder),
    or: vi.fn(() => queryBuilder),
    then: vi.fn((resolve) =>
      resolve({ data: [], error: null }),
    ),
  };

  return queryBuilder;
}

const feePaymentsQuery = createQueryBuilder();
const membersQuery = createQueryBuilder();
const profilesQuery = createQueryBuilder();
feePaymentsQuery.then.mockImplementation((resolve) =>
  resolve({ data: queryState.payments, error: null }),
);
membersQuery.then.mockImplementation((resolve) =>
  resolve({ data: queryState.members, error: null }),
);
profilesQuery.then.mockImplementation((resolve) =>
  resolve({ data: queryState.profileRows, error: null }),
);
const from = vi.fn((table: string) =>
  table === "fee_payments"
    ? feePaymentsQuery
    : table === "profiles"
      ? profilesQuery
      : membersQuery,
);

vi.mock("./actions", () => ({
  cancelFeePayment: vi.fn(),
  createFeePayment: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from })),
}));

describe("FeesPage", () => {
  beforeEach(() => {
    cleanup();
    queryState.payments = payments;
    queryState.members = members;
    queryState.profileRows = [
      {
        id: "profile-treasurer",
        club_positions: {
          name: "treasurer",
          sort_order: 30,
        },
      },
      {
        id: "profile-president",
        club_positions: {
          name: "president",
          sort_order: 10,
        },
      },
    ];
    from.mockClear();

    for (const query of [feePaymentsQuery, membersQuery, profilesQuery]) {
      query.select.mockClear();
      query.eq.mockClear();
      query.lte.mockClear();
      query.order.mockClear();
      query.in.mockClear();
      query.or.mockClear();
      query.then.mockClear();
    }

    feePaymentsQuery.then.mockImplementation((resolve) =>
      resolve({ data: queryState.payments, error: null }),
    );
    membersQuery.then.mockImplementation((resolve) =>
      resolve({ data: queryState.members, error: null }),
    );
    profilesQuery.then.mockImplementation((resolve) =>
      resolve({ data: queryState.profileRows, error: null }),
    );
  });

  it("renders monthly fee board rows with filters and summary", async () => {
    render(
      await FeesPage({
        searchParams: Promise.resolve({ month: "2026-07", q: "김", status: "all" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "회비 관리" })).toBeInTheDocument();
    expect(screen.getByLabelText("납부 월")).toHaveValue("2026-07");
    expect(screen.getByLabelText("검색")).toHaveValue("김");
    expect(screen.getByLabelText("상태")).toHaveValue("all");
    expect(screen.getByText("청구 대상")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "CSV 등록" }),
    ).toHaveAttribute("href", "/fees/new");
    expect(screen.getAllByText("미납").length).toBeGreaterThan(0);
    expect(screen.getAllByText("납부완료").length).toBeGreaterThan(0);

    const list = screen.getByRole("region", { name: "월별 회비 체크판" });
    expect(within(list).getByText("2026.07 · 총 1명")).toBeInTheDocument();
    expect(within(list).getByRole("cell", { name: "1234" })).toBeInTheDocument();
    expect(within(list).getByText("운영진")).toBeInTheDocument();
    expect(within(list).getByRole("cell", { name: "30,000원" })).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "납부 취소" })).toBeInTheDocument();
  });

  it("renders unpaid rows with an inline payment action", async () => {
    queryState.payments = [];

    render(
      await FeesPage({
        searchParams: Promise.resolve({ month: "2026-07", status: "unpaid" }),
      }),
    );

    const list = screen.getByRole("region", { name: "월별 회비 체크판" });
    expect(within(list).getAllByRole("button", { name: "납부 처리" })).toHaveLength(2);
    expect(within(list).getAllByText("운영진")).toHaveLength(2);
  });

  it("renders an empty state when no members match", async () => {
    queryState.members = [];

    render(
      await FeesPage({
        searchParams: Promise.resolve({ month: "2026-07" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "표시할 회원이 없습니다" })).toBeInTheDocument();
  });
});
