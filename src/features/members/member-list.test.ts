import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatMemberKind,
  formatMemberStatus,
  mapMemberRow,
  normalizeMemberListFilters,
  sortMemberListRows,
} from "./member-list";

describe("normalizeMemberListFilters", () => {
  it("trims the search query and keeps supported statuses", () => {
    expect(
      normalizeMemberListFilters({ q: "  김  ", status: "paused" }),
    ).toEqual({
      query: "김",
      status: "paused",
    });
  });

  it("falls back to all for missing or unsupported statuses", () => {
    expect(normalizeMemberListFilters({ status: "unknown" })).toEqual({
      query: "",
      status: "all",
    });
  });

  it("uses the first value when query params repeat", () => {
    expect(
      normalizeMemberListFilters({
        q: ["민수", "영희"],
        status: ["active", "withdrawn"],
      }),
    ).toEqual({
      query: "민수",
      status: "active",
    });
  });
});

describe("member list formatting", () => {
  it("maps database rows to screen rows", () => {
    expect(
      mapMemberRow({
        id: "member-id",
        name: "김민수",
        phone_last_four: "1234",
        operator_profile_id: "profile-id",
        status: "active",
        joined_date: "2026-07-01",
        withdrawn_date: null,
        withdrawal_reason: null,
        memo: "첫 등록",
      }),
    ).toEqual({
      id: "member-id",
      name: "김민수",
      phoneLastFour: "1234",
      operatorProfileId: "profile-id",
      operatorPositionName: null,
      operatorPositionSortOrder: null,
      status: "active",
      joinedDate: "2026-07-01",
      withdrawnDate: null,
      withdrawalReason: null,
      memo: "첫 등록",
    });
  });

  it("formats status labels and dates for Korean operators", () => {
    expect(formatMemberStatus("active")).toBe("활동중");
    expect(formatMemberStatus("paused")).toBe("휴회");
    expect(formatMemberStatus("withdrawn")).toBe("탈퇴");
    expect(formatDate("2026-07-01")).toBe("2026.07.01");
    expect(formatDate(null)).toBe("-");
  });

  it("formats member kind by operator profile linkage", () => {
    expect(formatMemberKind({ operatorProfileId: "profile-id" })).toBe("운영진");
    expect(formatMemberKind({ operatorProfileId: null })).toBe("일반회원");
  });

  it("sorts operators above general members by club position order", () => {
    const sorted = sortMemberListRows([
      {
        id: "general",
        name: "일반회원",
        phoneLastFour: null,
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
        name: "총무",
        phoneLastFour: null,
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
        name: "회장",
        phoneLastFour: null,
        operatorProfileId: "profile-president",
        operatorPositionName: "president",
        operatorPositionSortOrder: 10,
        status: "active",
        joinedDate: "2026-07-01",
        withdrawnDate: null,
        withdrawalReason: null,
        memo: null,
      },
    ]);

    expect(sorted.map((member) => member.id)).toEqual([
      "president",
      "treasurer",
      "general",
    ]);
  });
});
