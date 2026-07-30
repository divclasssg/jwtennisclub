import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import FeesPage from "./page";

const permissionMocks = vi.hoisted(() => ({
  currentOperatorHasPermission: vi.fn(async () => true),
}));

type FeeMemberFixture = {
  id: string;
  member_code: string;
  name: string;
  operator_profile_id: string | null;
  status: "active" | "paused" | "withdrawn";
  joined_date: string;
  withdrawn_date: string | null;
  pause_start_month: string | null;
  activity_start_month: string | null;
  memo: string | null;
};

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
      member_code: "M0001",
    },
  },
];

const members: FeeMemberFixture[] = [
  {
    id: "member-1",
    member_code: "M0001",
    name: "김민수",
    operator_profile_id: "profile-treasurer",
    status: "active",
    joined_date: "2026-07-01",
    withdrawn_date: null,
    pause_start_month: null,
    activity_start_month: "2026-07-01",
    memo: null,
  },
  {
    id: "member-2",
    member_code: "M0002",
    name: "이영희",
    operator_profile_id: "profile-president",
    status: "paused",
    joined_date: "2026-07-01",
    withdrawn_date: null,
    pause_start_month: "2026-08-01",
    activity_start_month: "2026-07-01",
    memo: null,
  },
];

const queryState = {
  payments,
  members,
  notes: [
    {
      id: "note-1",
      member_id: "member-1",
      period_month: "2026-07-01",
      memo: "다음 달 합산",
      created_by: "operator-id",
      updated_by: "operator-id",
      created_at: "2026-07-15T00:00:00Z",
      updated_at: "2026-07-15T00:00:00Z",
    },
  ],
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
    neq: vi.fn(() => queryBuilder),
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
const feeNotesQuery = createQueryBuilder();
const membersQuery = createQueryBuilder();
const profilesQuery = createQueryBuilder();
feePaymentsQuery.then.mockImplementation((resolve) =>
  resolve({ data: queryState.payments, error: null }),
);
feeNotesQuery.then.mockImplementation((resolve) =>
  resolve({ data: queryState.notes, error: null }),
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
    : table === "fee_monthly_notes"
      ? feeNotesQuery
    : table === "profiles"
      ? profilesQuery
      : membersQuery,
);

vi.mock("./actions", () => ({
  cancelFeePayment: vi.fn(),
  createFeePayment: vi.fn(),
  saveFeeMonthlyNote: vi.fn(),
}));

vi.mock("@/features/auth/operator-context", () => ({
  currentOperatorHasPermission: permissionMocks.currentOperatorHasPermission,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from })),
}));

describe("FeesPage", () => {
  beforeEach(() => {
    cleanup();
    queryState.payments = payments;
    queryState.members = members;
    queryState.notes = [
      {
        id: "note-1",
        member_id: "member-1",
        period_month: "2026-07-01",
        memo: "다음 달 합산",
        created_by: "operator-id",
        updated_by: "operator-id",
        created_at: "2026-07-15T00:00:00Z",
        updated_at: "2026-07-15T00:00:00Z",
      },
    ];
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

    for (const query of [feePaymentsQuery, feeNotesQuery, membersQuery, profilesQuery]) {
      query.select.mockClear();
      query.eq.mockClear();
      query.lte.mockClear();
      query.neq.mockClear();
      query.order.mockClear();
      query.in.mockClear();
      query.or.mockClear();
      query.then.mockClear();
    }

    feePaymentsQuery.then.mockImplementation((resolve) =>
      resolve({ data: queryState.payments, error: null }),
    );
    feeNotesQuery.then.mockImplementation((resolve) =>
      resolve({ data: queryState.notes, error: null }),
    );
    membersQuery.then.mockImplementation((resolve) =>
      resolve({ data: queryState.members, error: null }),
    );
    profilesQuery.then.mockImplementation((resolve) =>
      resolve({ data: queryState.profileRows, error: null }),
    );
    permissionMocks.currentOperatorHasPermission.mockReset();
    permissionMocks.currentOperatorHasPermission.mockResolvedValue(true);
  });

  it("renders monthly fee board rows with filters and summary", async () => {
    render(
      await FeesPage({
        searchParams: Promise.resolve({ month: "2026-07", q: "김" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "회비 관리" })).toBeInTheDocument();
    expect(screen.getByLabelText("납부 월")).toHaveValue("2026-07");
    expect(screen.getByLabelText("검색")).toHaveValue("김");
    expect(screen.queryByLabelText("상태")).not.toBeInTheDocument();
    expect(screen.getByText("청구 대상")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "CSV 등록" }),
    ).toHaveAttribute("href", "/fees/new");
    expect(screen.getAllByText("미납").length).toBeGreaterThan(0);
    expect(screen.getAllByText("납부완료").length).toBeGreaterThan(0);

    const list = screen.getByRole("region", { name: "월별 회비 체크판" });
    const table = within(list).getByRole("table");

    expect(within(list).getByText("2026.07 · 총 1명")).toBeInTheDocument();
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "회원번호",
      "이름",
      "구분",
      "상태",
      "기준 금액",
      "납부일",
      "메모",
      "처리",
    ]);
    expect(within(table).getByRole("cell", { name: "M0001" })).toBeInTheDocument();
    expect(within(table).queryByText("1234")).not.toBeInTheDocument();
    const memberKindCell = within(table).getByRole("cell", { name: "운영진" });
    const paymentStatusCell = within(table).getByRole("cell", { name: "납부완료" });

    expect(memberKindCell.querySelector("span")).toBeNull();
    expect(paymentStatusCell.querySelector("span")).toBeNull();
    expect(within(table).getByRole("cell", { name: "30,000원" })).toBeInTheDocument();
    expect(within(table).getByRole("button", { name: "납부 취소" })).toBeInTheDocument();
    expect(membersQuery.select).toHaveBeenCalledWith(
      "id, member_code, name, operator_profile_id, status, joined_date, withdrawn_date, pause_start_month, activity_start_month, memo",
    );
    expect(membersQuery.or).toHaveBeenCalledWith(
      "status.eq.active,and(status.eq.paused,pause_start_month.gt.2026-07-01),and(status.eq.withdrawn,withdrawn_date.gt.2026-07-31)",
    );
    expect(membersQuery.neq).toHaveBeenCalledWith("member_code", "#0000");
    expect(membersQuery.lte).toHaveBeenCalledWith(
      "activity_start_month",
      "2026-07-01",
    );
  });

  it("includes a member withdrawn after July in the July fee board", async () => {
    queryState.payments = [];
    queryState.members = [
      {
        id: "member-withdrawn",
        member_code: "M0003",
        name: "박지수",
        operator_profile_id: null,
        status: "withdrawn",
        joined_date: "2026-07-01",
        withdrawn_date: "2026-08-01",
        pause_start_month: null,
        activity_start_month: "2026-07-01",
        memo: null,
      },
    ];

    render(
      await FeesPage({ searchParams: Promise.resolve({ month: "2026-07" }) }),
    );

    expect(screen.getByRole("cell", { name: "M0003" })).toBeInTheDocument();
    expect(membersQuery.or).toHaveBeenCalledWith(
      "status.eq.active,and(status.eq.paused,pause_start_month.gt.2026-07-01),and(status.eq.withdrawn,withdrawn_date.gt.2026-07-31)",
    );
  });

  it("renders unpaid rows with an inline payment action", async () => {
    queryState.payments = [];

    render(
      await FeesPage({
        searchParams: Promise.resolve({ month: "2026-07" }),
      }),
    );

    const list = screen.getByRole("region", { name: "월별 회비 체크판" });
    const table = within(list).getByRole("table");

    expect(within(table).getAllByRole("button", { name: "납부 처리" })).toHaveLength(2);
    expect(within(table).getAllByText("운영진")).toHaveLength(2);
  });

  it("sorts fee rows by amount and uses the same order on mobile", async () => {
    queryState.payments = [{ ...payments[0], amount: 40000 }];

    render(await FeesPage({
      searchParams: Promise.resolve({
        month: "2026-07",
        sort: "amount",
        direction: "asc",
      }),
    }));

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual(["이영희", "김민수"]);
    expect(screen.getByRole("link", { name: "기준 금액 내림차순 정렬" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "납부일 오름차순 정렬" })).toHaveAttribute(
      "href",
      "/fees?month=2026-07&sort=paidDate&direction=asc",
    );
    expect(screen.queryByRole("link", { name: "처리 오름차순 정렬" })).not.toBeInTheDocument();

    const mobileList = screen.getByRole("list", { name: "모바일 회비 목록" });
    expect(within(mobileList).getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["이영희", "김민수"]);
  });

  it("renders a mobile fee list with the same payment details", async () => {
    render(
      await FeesPage({
        searchParams: Promise.resolve({ month: "2026-07" }),
      }),
    );

    const mobileList = screen.getByRole("list", { name: "모바일 회비 목록" });
    const items = within(mobileList).getAllByRole("listitem");

    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole("heading", { name: "김민수" })).toBeInTheDocument();
    expect(within(items[0]).getByText("회원번호 M0001")).toBeInTheDocument();
    expect(within(items[0]).getByText("납부일 2026.07.03")).toBeInTheDocument();
    expect(within(items[0]).getByText("다음 달 합산")).toBeInTheDocument();
    expect(
      within(items[0]).getByRole("link", { name: "김민수 메모 수정" }),
    ).toBeInTheDocument();
    expect(within(items[0]).getByRole("button", { name: "납부 취소" })).toBeInTheDocument();
    expect(within(items[1]).getByRole("heading", { name: "이영희" })).toBeInTheDocument();
    expect(within(items[1]).getByText("회원번호 M0002")).toBeInTheDocument();
    expect(within(items[1]).getByText("미납")).toBeInTheDocument();
    expect(within(items[0]).getByText("기준 금액 30,000원")).toBeInTheDocument();
    expect(within(items[1]).getByRole("button", { name: "납부 처리" })).toBeInTheDocument();
    expect(
      within(items[1]).getByRole("link", { name: "이영희 메모 입력" }),
    ).toBeInTheDocument();
  });

  it("renders independent note actions for paid and unpaid members", async () => {
    render(
      await FeesPage({
        searchParams: Promise.resolve({
          month: "2026-07",
          sort: "memo",
          direction: "desc",
        }),
      }),
    );

    const table = screen.getByRole("table");
    expect(within(table).getByText("다음 달 합산")).toBeInTheDocument();
    expect(
      within(table).getByRole("link", { name: "김민수 메모 수정" }),
    ).toHaveAttribute(
      "href",
      "/fees?month=2026-07&sort=memo&direction=desc&note=member-1",
    );
    expect(
      within(table).getByRole("link", { name: "이영희 메모 입력" }),
    ).toBeInTheDocument();
  });

  it("opens the selected member note modal and preserves close state", async () => {
    render(
      await FeesPage({
        searchParams: Promise.resolve({
          month: "2026-07",
          q: "김",
          sort: "memo",
          direction: "desc",
          note: "member-1",
        }),
      }),
    );

    expect(
      screen.getByRole("dialog", { name: "김민수 2026.07 회비 메모" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("메모")).toHaveValue("다음 달 합산");
    expect(screen.getByRole("link", { name: "취소" })).toHaveAttribute(
      "href",
      "/fees?month=2026-07&q=%EA%B9%80&sort=memo&direction=desc",
    );
  });

  it("keeps notes readable but hides edit controls without manage permission", async () => {
    permissionMocks.currentOperatorHasPermission.mockResolvedValue(false);

    render(
      await FeesPage({
        searchParams: Promise.resolve({ month: "2026-07", note: "member-1" }),
      }),
    );

    expect(screen.getAllByText("다음 달 합산").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /메모 (입력|수정)/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
