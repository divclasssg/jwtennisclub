import { describe, expect, it } from "vitest";
import {
  buildFeesHref,
  mapFeeMonthlyNoteRow,
  normalizeFeeNoteInput,
} from "./fee-note";

describe("monthly fee notes", () => {
  it("maps a database row", () => {
    expect(
      mapFeeMonthlyNoteRow({
        id: "note-1",
        member_id: "member-1",
        period_month: "2026-07-01",
        memo: "확인 필요",
        created_by: "operator-id",
        updated_by: "operator-id",
        created_at: "2026-07-15T00:00:00Z",
        updated_at: "2026-07-15T00:00:00Z",
      }),
    ).toEqual({
      id: "note-1",
      memberId: "member-1",
      periodMonth: "2026-07-01",
      memo: "확인 필요",
      createdBy: "operator-id",
      updatedBy: "operator-id",
      createdAt: "2026-07-15T00:00:00Z",
      updatedAt: "2026-07-15T00:00:00Z",
    });
  });

  it("normalizes note input", () => {
    expect(normalizeFeeNoteInput("  다음 달 합산  ")).toEqual({
      ok: true,
      memo: "다음 달 합산",
    });
    expect(normalizeFeeNoteInput("   ")).toEqual({ ok: true, memo: null });
    expect(normalizeFeeNoteInput("가".repeat(501))).toEqual({
      ok: false,
      error: "too-long",
    });
  });

  it("preserves valid list state in a note URL", () => {
    expect(
      buildFeesHref(
        {
          month: "2026-07",
          q: "김",
          sort: "memo",
          direction: "desc",
        },
        { note: "member-1" },
      ),
    ).toBe(
      "/fees?month=2026-07&q=%EA%B9%80&sort=memo&direction=desc&note=member-1",
    );
  });
});
