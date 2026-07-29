import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const deleteQuery = {
    eq: vi.fn(async () => ({ error: null })),
  };
  const feePaymentsTable = {
    delete: vi.fn(() => deleteQuery),
    insert: vi.fn(async () => ({ error: null })),
  };
  const importMembersQuery = {
    eq: vi.fn(async () => ({
      data: [
        {
          id: "member-1",
          member_code: "M0001",
          status: "active",
          pause_start_month: null,
        },
      ],
      error: null,
    })),
    in: vi.fn(() => importMembersQuery),
    then: vi.fn((resolve) => resolve({
      data: [
        {
          id: "member-1",
          member_code: "M0001",
          status: "active",
          pause_start_month: null,
        },
      ],
      error: null,
    })),
  };
  const targetMemberQuery = {
    eq: vi.fn(() => targetMemberQuery),
    neq: vi.fn(() => targetMemberQuery),
    lte: vi.fn(() => targetMemberQuery),
    or: vi.fn(() => targetMemberQuery),
    maybeSingle: vi.fn(async () => ({
      data: { id: "member-1" } as { id: string } | null,
      error: null,
    })),
  };
  const membersTable = {
    select: vi.fn((columns: string) =>
      columns === "id" || columns.includes("joined_date")
        ? targetMemberQuery
        : importMembersQuery,
    ),
  };
  const existingNoteQuery = {
    eq: vi.fn(() => existingNoteQuery),
    maybeSingle: vi.fn(async () => ({
      data: null as { id: string } | null,
      error: null,
    })),
  };
  const noteUpdateQuery = {
    eq: vi.fn(async () => ({ error: null })),
  };
  const noteDeleteQuery = {
    eq: vi.fn(() => noteDeleteQuery),
    then: vi.fn((resolve) => resolve({ error: null })),
  };
  const noteTable = {
    select: vi.fn(() => existingNoteQuery),
    insert: vi.fn(async () => ({ error: null })),
    update: vi.fn(() => noteUpdateQuery),
    delete: vi.fn(() => noteDeleteQuery),
  };
  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "operator-id" } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "fee_payments") {
        return feePaymentsTable;
      }

      if (table === "members") {
        return membersTable;
      }

      if (table === "fee_monthly_notes") {
        return noteTable;
      }

        throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return {
    deleteQuery,
    feePaymentsTable,
    importMembersQuery,
    targetMemberQuery,
    membersTable,
    existingNoteQuery,
    noteUpdateQuery,
    noteDeleteQuery,
    noteTable,
    currentOperatorHasPermission: vi.fn(async () => true),
    revalidatePath: vi.fn(),
    redirect: vi.fn((path: string) => {
      throw new Error(`redirect:${path}`);
    }),
    supabase,
  };
});

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mocks.supabase),
}));

vi.mock("@/features/auth/operator-context", () => ({
  currentOperatorHasPermission: mocks.currentOperatorHasPermission,
}));

import {
  cancelFeePayment,
  importFeePaymentsCsv,
  saveFeeMonthlyNote,
} from "./actions";

describe("fee payment actions", () => {
  beforeEach(() => {
    mocks.redirect.mockClear();
    mocks.revalidatePath.mockClear();
    mocks.supabase.auth.getUser.mockClear();
    mocks.supabase.from.mockClear();
    mocks.feePaymentsTable.delete.mockClear();
    mocks.feePaymentsTable.insert.mockClear();
    mocks.membersTable.select.mockClear();
    mocks.importMembersQuery.eq.mockClear();
    mocks.importMembersQuery.in.mockClear();
    mocks.importMembersQuery.then.mockClear();
    mocks.targetMemberQuery.eq.mockClear();
    mocks.targetMemberQuery.neq.mockClear();
    mocks.targetMemberQuery.lte.mockClear();
    mocks.targetMemberQuery.or.mockClear();
    mocks.targetMemberQuery.maybeSingle.mockReset();
    mocks.targetMemberQuery.maybeSingle.mockResolvedValue({
      data: { id: "member-1" },
      error: null,
    });
    mocks.existingNoteQuery.eq.mockClear();
    mocks.existingNoteQuery.maybeSingle.mockReset();
    mocks.existingNoteQuery.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.noteUpdateQuery.eq.mockClear();
    mocks.noteDeleteQuery.eq.mockClear();
    mocks.noteDeleteQuery.then.mockClear();
    mocks.noteDeleteQuery.then.mockImplementation((resolve) => resolve({ error: null }));
    mocks.noteTable.select.mockClear();
    mocks.noteTable.insert.mockClear();
    mocks.noteTable.update.mockClear();
    mocks.noteTable.delete.mockClear();
    mocks.noteTable.insert.mockResolvedValue({ error: null });
    mocks.currentOperatorHasPermission.mockReset();
    mocks.currentOperatorHasPermission.mockResolvedValue(true);
    mocks.deleteQuery.eq.mockClear();
    mocks.deleteQuery.eq.mockResolvedValue({ error: null });
    mocks.feePaymentsTable.insert.mockResolvedValue({ error: null });
  });

  it("cancels a fee payment and returns to the selected month", async () => {
    const formData = new FormData();
    formData.set("paymentId", "payment-1");
    formData.set("periodMonth", "2026-07");

    await expect(cancelFeePayment(formData)).rejects.toThrow(
      "redirect:/fees?status=cancelled&month=2026-07",
    );

    expect(mocks.supabase.from).toHaveBeenCalledWith("fee_payments");
    expect(mocks.feePaymentsTable.delete).toHaveBeenCalled();
    expect(mocks.deleteQuery.eq).toHaveBeenCalledWith("id", "payment-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/fees");
  });

  it("imports fee payments from CSV by matching members eligible for the payment month", async () => {
    const formData = new FormData();
    formData.set(
      "csvFile",
      new File(
        [
          [
            "memberCode,periodMonth,amount,paidDate,memo",
            "m0001,2026-07,30000,2026-07-03,7월 회비",
          ].join("\n"),
        ],
        "fees.csv",
        { type: "text/csv" },
      ),
    );

    await expect(importFeePaymentsCsv(formData)).rejects.toThrow(
      "redirect:/fees?status=imported&count=1&month=2026-07",
    );

    expect(mocks.supabase.from).toHaveBeenCalledWith("members");
    expect(mocks.membersTable.select).toHaveBeenCalledWith(
      "id, member_code, status, pause_start_month",
    );
    expect(mocks.importMembersQuery.in).toHaveBeenCalledWith("status", ["active", "paused"]);
    expect(mocks.feePaymentsTable.insert).toHaveBeenCalledWith([
      {
        member_id: "member-1",
        period_month: "2026-07-01",
        amount: 30000,
        paid_date: "2026-07-03",
        memo: "7월 회비",
        created_by: "operator-id",
        updated_by: "operator-id",
      },
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/fees");
  });

  it("accepts an August-paused member's July CSV row but rejects its August row", async () => {
    mocks.importMembersQuery.then.mockImplementationOnce((resolve) => resolve({
      data: [
        {
          id: "member-2",
          member_code: "M0002",
          status: "paused",
          pause_start_month: "2026-08-01",
        },
      ],
      error: null,
    }));
    const formData = new FormData();
    formData.set(
      "csvFile",
      new File(
        [
          [
            "memberCode,periodMonth,amount,paidDate,memo",
            "m0002,2026-07,30000,2026-07-03,7월 회비",
            "m0002,2026-08,30000,2026-08-03,8월 회비",
          ].join("\n"),
        ],
        "fees.csv",
        { type: "text/csv" },
      ),
    );

    await expect(importFeePaymentsCsv(formData)).rejects.toThrow(
      "redirect:/fees/new?importError=member-not-found&line=3",
    );

    expect(mocks.importMembersQuery.in).toHaveBeenCalledWith("status", ["active", "paused"]);
    expect(mocks.feePaymentsTable.insert).not.toHaveBeenCalled();
  });

  it("redirects a missing member with the original CSV line after blank rows", async () => {
    mocks.importMembersQuery.then.mockImplementationOnce((resolve) =>
      resolve({ data: [], error: null }),
    );
    const formData = new FormData();
    formData.set(
      "csvFile",
      new File(
        [
          [
            "memberCode,periodMonth,amount,paidDate,memo",
            "",
            "m0001,2026-07,30000,2026-07-03,7월 회비",
          ].join("\r\n"),
        ],
        "fees.csv",
        { type: "text/csv" },
      ),
    );

    await expect(importFeePaymentsCsv(formData)).rejects.toThrow(
      "redirect:/fees/new?importError=member-not-found&line=3",
    );
    expect(mocks.feePaymentsTable.insert).not.toHaveBeenCalled();
  });

  it("redirects a missing member with the physical line after a multiline cell", async () => {
    const formData = new FormData();
    formData.set(
      "csvFile",
      new File(
        [
          [
            "memberCode,periodMonth,amount,paidDate,memo",
            'm0001,2026-07,30000,2026-07-03,"첫 줄',
            '둘째 줄"',
            "",
            "m9999,2026-07,30000,2026-07-04,없는 회원",
          ].join("\r\n"),
        ],
        "fees.csv",
        { type: "text/csv" },
      ),
    );

    await expect(importFeePaymentsCsv(formData)).rejects.toThrow(
      "redirect:/fees/new?importError=member-not-found&line=5",
    );
    expect(mocks.feePaymentsTable.insert).not.toHaveBeenCalled();
  });

  it("creates a trimmed monthly note and preserves list state", async () => {
    const formData = buildNoteFormData("  다음 달 합산  ");

    await expect(saveFeeMonthlyNote(formData)).rejects.toThrow(
      "redirect:/fees?month=2026-07&q=%EA%B9%80&sort=memo&direction=desc&status=note-saved",
    );

    expect(mocks.noteTable.insert).toHaveBeenCalledWith({
      member_id: "member-1",
      period_month: "2026-07-01",
      memo: "다음 달 합산",
      created_by: "operator-id",
      updated_by: "operator-id",
    });
    expect(mocks.membersTable.select).toHaveBeenCalledWith(
      "id, status, pause_start_month, joined_date, member_code",
    );
    expect(mocks.targetMemberQuery.or).toHaveBeenCalledWith(
      "status.eq.active,and(status.eq.paused,pause_start_month.gt.2026-07-01)",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/fees");
  });

  it("updates a note without replacing its creator", async () => {
    mocks.existingNoteQuery.maybeSingle.mockResolvedValueOnce({
      data: { id: "note-1" },
      error: null,
    });

    await expect(saveFeeMonthlyNote(buildNoteFormData("수정 메모"))).rejects.toThrow(
      "status=note-saved",
    );

    expect(mocks.noteTable.update).toHaveBeenCalledWith({
      memo: "수정 메모",
      updated_by: "operator-id",
      updated_at: expect.any(String),
    });
    expect(mocks.noteUpdateQuery.eq).toHaveBeenCalledWith("id", "note-1");
  });

  it("deletes the independent note when the saved value is blank", async () => {
    await expect(saveFeeMonthlyNote(buildNoteFormData("   "))).rejects.toThrow(
      "status=note-saved",
    );

    expect(mocks.noteTable.delete).toHaveBeenCalled();
    expect(mocks.noteDeleteQuery.eq).toHaveBeenNthCalledWith(1, "member_id", "member-1");
    expect(mocks.noteDeleteQuery.eq).toHaveBeenNthCalledWith(
      2,
      "period_month",
      "2026-07-01",
    );
  });

  it("rejects an overlong note without writing", async () => {
    await expect(
      saveFeeMonthlyNote(buildNoteFormData("가".repeat(501))),
    ).rejects.toThrow(
      "redirect:/fees?month=2026-07&q=%EA%B9%80&sort=memo&direction=desc&note=member-1&noteError=too-long",
    );

    expect(mocks.noteTable.insert).not.toHaveBeenCalled();
    expect(mocks.noteTable.update).not.toHaveBeenCalled();
    expect(mocks.noteTable.delete).not.toHaveBeenCalled();
  });

  it("rejects note mutation without create or update permission", async () => {
    mocks.currentOperatorHasPermission.mockResolvedValue(false);

    await expect(saveFeeMonthlyNote(buildNoteFormData("권한 없음"))).rejects.toThrow(
      "noteError=forbidden",
    );

    expect(mocks.supabase.from).not.toHaveBeenCalledWith("fee_monthly_notes");
  });

  it("rejects a member outside the monthly fee targets", async () => {
    mocks.targetMemberQuery.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    await expect(saveFeeMonthlyNote(buildNoteFormData("대상 아님"))).rejects.toThrow(
      "noteError=invalid-member",
    );

    expect(mocks.noteTable.insert).not.toHaveBeenCalled();
  });
});

function buildNoteFormData(memo: string) {
  const formData = new FormData();
  formData.set("memberId", "member-1");
  formData.set("periodMonth", "2026-07");
  formData.set("query", "김");
  formData.set("sort", "memo");
  formData.set("direction", "desc");
  formData.set("memo", memo);
  return formData;
}
