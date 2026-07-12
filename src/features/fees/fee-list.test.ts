import { describe, expect, it } from "vitest";
import {
  buildFeeBoardRows,
  buildFeeListSummary,
  mapFeePaymentRow,
  normalizeFeeListFilters,
} from "./fee-list";

describe("normalizeFeeListFilters", () => {
  it("normalizes month and search query params", () => {
    expect(
      normalizeFeeListFilters(
        { month: "2026-07", q: "  김  " },
        "2026-06-01",
      ),
    ).toEqual({
      periodMonth: "2026-07-01",
      query: "김",
      status: "all",
    });
  });

  it("falls back to the current month when the month is invalid", () => {
    expect(
      normalizeFeeListFilters({ month: "bad" }, "2026-06-01"),
    ).toEqual({
      periodMonth: "2026-06-01",
      query: "",
      status: "all",
    });
  });

  it("keeps supported status filters", () => {
    expect(
      normalizeFeeListFilters({ status: "unpaid" }, "2026-06-01"),
    ).toEqual({
      periodMonth: "2026-06-01",
      query: "",
      status: "unpaid",
    });
  });
});

describe("fee payment list helpers", () => {
  it("maps database rows to screen records", () => {
    expect(
      mapFeePaymentRow({
        id: "payment-id",
        member_id: "member-id",
        period_month: "2026-07-01",
        amount: 50000,
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
      }),
    ).toEqual({
      id: "payment-id",
      memberId: "member-id",
      memberName: "김민수",
      memberCode: "M0001",
      periodMonth: "2026-07-01",
      amount: 50000,
      paidDate: "2026-07-03",
      memo: "입금 확인",
      createdBy: "operator-id",
      updatedBy: "operator-id",
      createdAt: "2026-07-03T00:00:00Z",
      updatedAt: "2026-07-03T00:00:00Z",
    });
  });

  it("summarizes paid and unpaid counts", () => {
    expect(
      buildFeeListSummary({
        expectedCount: 3,
        payments: [{ amount: 30000 }, { amount: 40000 }],
        monthlyFeeAmount: 30000,
      }),
    ).toEqual({
      expectedCount: 3,
      paidCount: 2,
      unpaidCount: 1,
      paidTotal: 70000,
      expectedTotal: 90000,
    });
  });

  it("keeps operator members above general members by club position order", () => {
    const rows = buildFeeBoardRows({
      members: [
        {
          id: "general",
          memberCode: "M0003",
          name: "일반회원",
          operatorProfileId: null,
          operatorPositionName: null,
          operatorPositionSortOrder: null,
          status: "active",
          joinedDate: "2026-07-01",
          withdrawnDate: null,
          withdrawalReason: null,
          memo: null,
        },
        {
          id: "treasurer",
          memberCode: "M0002",
          name: "총무",
          operatorProfileId: "profile-treasurer",
          operatorPositionName: "treasurer",
          operatorPositionSortOrder: 30,
          status: "active",
          joinedDate: "2026-07-01",
          withdrawnDate: null,
          withdrawalReason: null,
          memo: null,
        },
        {
          id: "president",
          memberCode: "M0001",
          name: "회장",
          operatorProfileId: "profile-president",
          operatorPositionName: "president",
          operatorPositionSortOrder: 10,
          status: "active",
          joinedDate: "2026-07-01",
          withdrawnDate: null,
          withdrawalReason: null,
          memo: null,
        },
      ],
      payments: [],
    });

    expect(rows.map((row) => row.memberId)).toEqual([
      "president",
      "treasurer",
      "general",
    ]);
    expect(rows.map((row) => row.operatorProfileId)).toEqual([
      "profile-president",
      "profile-treasurer",
      null,
    ]);
  });
});
