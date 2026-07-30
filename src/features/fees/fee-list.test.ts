import { describe, expect, it } from "vitest";
import {
  buildFeeBoardRows,
  buildFeeListSummary,
  getFeePaymentStatus,
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
    });
  });

  it("falls back to the current month when the month is invalid", () => {
    expect(
      normalizeFeeListFilters({ month: "bad" }, "2026-06-01"),
    ).toEqual({
      periodMonth: "2026-06-01",
      query: "",
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

  it("counts only exact and overpayments as fully paid while preserving actual receipts", () => {
    expect(
      buildFeeListSummary({
        expectedCount: 4,
        payments: [
          { amount: 10000 },
          { amount: 30000 },
          { amount: 40000 },
        ],
        monthlyFeeAmount: 30000,
      }),
    ).toEqual({
      expectedCount: 4,
      paidCount: 2,
      unpaidCount: 2,
      paidTotal: 80000,
      expectedTotal: 120000,
    });
  });

  it.each([
    [null, { label: "미납", remainingAmount: 30000 }],
    [{ amount: 10000 }, { label: "부분납부", remainingAmount: 20000 }],
    [{ amount: 30000 }, { label: "납부완료", remainingAmount: 0 }],
    [{ amount: 40000 }, { label: "납부완료", remainingAmount: 0 }],
  ])(
    "classifies payment %j without applying one member's overpayment to another",
    (payment, expected) => {
      expect(getFeePaymentStatus(payment, 30000)).toEqual(expected);
    },
  );

  it("sorts fee board members by member code", () => {
    const rows = buildFeeBoardRows({
      members: [
        {
          id: "excluded",
          memberCode: "#0000",
          name: "회비 제외 회원",
          operatorProfileId: null,
          operatorPositionName: null,
          operatorPositionSortOrder: null,
        },
        {
          id: "general",
          memberCode: "M0001",
          name: "일반회원",
          operatorProfileId: null,
          operatorPositionName: null,
          operatorPositionSortOrder: null,
        },
        {
          id: "treasurer",
          memberCode: "M0002",
          name: "총무",
          operatorProfileId: "profile-treasurer",
          operatorPositionName: "treasurer",
          operatorPositionSortOrder: 30,
        },
        {
          id: "president",
          memberCode: "M0003",
          name: "회장",
          operatorProfileId: "profile-president",
          operatorPositionName: "president",
          operatorPositionSortOrder: 10,
        },
      ],
      payments: [],
      notes: [
        {
          id: "note-general",
          memberId: "general",
          periodMonth: "2026-07-01",
          memo: "미납 메모",
          createdBy: "operator-id",
          updatedBy: "operator-id",
          createdAt: "2026-07-15T00:00:00Z",
          updatedAt: "2026-07-15T00:00:00Z",
        },
      ],
    });

    expect(rows.map((row) => row.memberId)).toEqual([
      "general",
      "treasurer",
      "president",
    ]);
    expect(rows.map((row) => row.memberId)).not.toContain("excluded");
    expect(rows.map((row) => row.operatorProfileId)).toEqual([
      null,
      "profile-treasurer",
      "profile-president",
    ]);
    expect(rows[0].payment).toBeNull();
    expect(rows[0].note?.memo).toBe("미납 메모");
  });
});
