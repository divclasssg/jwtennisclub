import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    rpc: mocks.rpc,
  })),
}));

import { createMember, importMembersCsv, updateMember } from "./actions";

const initialState = { status: "idle" as const };

function memberFormData(confirmation?: "phone-reuse" | "name-without-phone") {
  const formData = new FormData();
  formData.set("name", "홍길동");
  formData.set("phoneNumber", "010-1234-5678");
  formData.set("groupId", "group-a");
  formData.set("status", "active");
  formData.set("joinedDate", "2026-07-01");
  formData.set("activityStartMonth", "2026-07-01");
  if (confirmation) formData.set("duplicateConfirmation", confirmation);
  return formData;
}

describe("member actions", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "operator-id" } },
      error: null,
    });
    mocks.rpc.mockReset();
    mocks.from.mockReset();
    mocks.redirect.mockClear();
    mocks.revalidatePath.mockClear();
  });

  it("redirects to a phone reuse warning without exposing the phone", async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: "PHONE_REUSE_CONFIRMATION_REQUIRED" },
      error: null,
    });

    await expect(createMember(initialState, memberFormData())).resolves.toEqual({
      status: "confirmation-required",
      reason: "phone-reuse",
      candidate: expect.objectContaining({
        name: "홍길동",
        phoneNumber: "010-1234-5678",
        groupId: "group-a",
        status: "active",
        joinedDate: "2026-07-01",
      }),
    });

    expect(mocks.rpc).toHaveBeenCalledWith("save_member_with_contact", {
      member_id: null,
      member_data: expect.objectContaining({
        name: "홍길동",
        phone_number: "01012345678",
        group_id: "group-a",
        activity_start_month: "2026-07-01",
      }),
      duplicate_confirmation: null,
    });
    expect(mocks.redirect.mock.calls.flat().join(" ")).not.toContain(
      "01012345678",
    );
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("resubmits a confirmed phone reuse and completes the save", async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: "SAVED", member_code: "A0001" },
      error: null,
    });

    await expect(createMember(initialState, memberFormData("phone-reuse"))).rejects.toThrow(
      "redirect:/members?status=created&memberCode=A0001",
    );

    expect(mocks.rpc).toHaveBeenCalledWith(
      "save_member_with_contact",
      expect.objectContaining({ duplicate_confirmation: "CONFIRM_PHONE_REUSE" }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/members");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("passes a paused member's start month to the save RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: "SAVED", member_code: "A0001" },
      error: null,
    });
    const formData = memberFormData();
    formData.set("status", "paused");
    formData.set("pauseStartMonth", "2026-08-01");

    await expect(createMember(initialState, formData)).rejects.toThrow(
      "redirect:/members?status=created&memberCode=A0001",
    );

    expect(mocks.rpc).toHaveBeenCalledWith("save_member_with_contact", {
      member_id: null,
      member_data: expect.objectContaining({
        status: "paused",
        pause_start_month: "2026-08-01",
      }),
      duplicate_confirmation: null,
    });
  });

  it.each([
    ["create", createMember, "/members/new?error=invalid-activity-start-month"],
    [
      "edit",
      updateMember,
      "/members/member-id/edit?error=invalid-activity-start-month",
    ],
  ] as const)(
    "routes an invalid activity start month to the stable %s error",
    async (_mode, action, redirectPath) => {
      const formData = memberFormData();
      formData.set("activityStartMonth", "2026-06");
      if (action === updateMember) formData.set("id", "member-id");

      await expect(action(initialState, formData)).rejects.toThrow(
        `redirect:${redirectPath}`,
      );

      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );

  it("disables general member CSV imports without calling the database", async () => {
    const formData = new FormData();
    formData.set(
      "csvFile",
      new File(["name,phoneNumber\n홍길동,010-1234-5678"], "members.csv", {
        type: "text/csv",
      }),
    );

    await expect(importMembersCsv(formData)).rejects.toThrow(
      "redirect:/members/new?importError=import-disabled",
    );

    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("redirects an update to the name-only confirmation state", async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: "NAME_ONLY_CONFIRMATION_REQUIRED" },
      error: null,
    });
    const formData = memberFormData();
    formData.set("id", "member-id");

    await expect(updateMember(initialState, formData)).resolves.toEqual({
      status: "confirmation-required",
      reason: "name-without-phone",
      candidate: expect.objectContaining({ name: "홍길동" }),
    });

    expect(mocks.rpc).toHaveBeenCalledWith(
      "save_member_with_contact",
      expect.objectContaining({ member_id: "member-id" }),
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("redirects a blocked update without revalidating", async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: "DUPLICATE_BLOCKED" },
      error: null,
    });
    const formData = memberFormData();
    formData.set("id", "member-id");

    await expect(updateMember(initialState, formData)).rejects.toThrow(
      "redirect:/members/member-id/edit?error=duplicate-member",
    );

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("omits contact data when a non-contact manager updates other fields", async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: "SAVED", member_code: "A0001" },
      error: null,
    });
    const formData = memberFormData();
    formData.set("id", "member-id");
    formData.delete("phoneNumber");
    formData.set("memo", "연락처 외 변경");

    await expect(updateMember(initialState, formData)).rejects.toThrow(
      "redirect:/members?status=updated",
    );

    expect(mocks.rpc).toHaveBeenCalledWith(
      "save_member_with_contact",
      expect.objectContaining({
        member_data: expect.not.objectContaining({ phone_number: expect.anything() }),
      }),
    );
  });

  it("supports the two-submit name-only flow when the create form has no contact control", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { status: "NAME_ONLY_CONFIRMATION_REQUIRED" }, error: null });
    const formData = memberFormData();
    formData.delete("phoneNumber");
    await expect(createMember(initialState, formData)).resolves.toEqual(expect.objectContaining({
      status: "confirmation-required",
      reason: "name-without-phone",
    }));
    expect(mocks.rpc).toHaveBeenCalledWith("save_member_with_contact", expect.objectContaining({
      member_data: expect.not.objectContaining({ phone_number: expect.anything() }),
      duplicate_confirmation: null,
    }));

    mocks.rpc.mockResolvedValueOnce({ data: { status: "SAVED", member_code: "M0002" }, error: null });
    formData.set("duplicateConfirmation", "name-without-phone");
    await expect(createMember(initialState, formData)).rejects.toThrow("redirect:/members?status=created&memberCode=M0002");
    expect(mocks.rpc).toHaveBeenLastCalledWith("save_member_with_contact", expect.objectContaining({
      member_data: expect.not.objectContaining({ phone_number: expect.anything() }),
      duplicate_confirmation: "CONFIRM_NAME_ONLY",
    }));
  });
});
