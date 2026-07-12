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

import { createMember } from "./actions";

function memberFormData(confirmation?: "phone-reuse" | "name-without-phone") {
  const formData = new FormData();
  formData.set("name", "홍길동");
  formData.set("phoneNumber", "010-1234-5678");
  formData.set("groupId", "group-a");
  formData.set("status", "active");
  formData.set("joinedDate", "2026-07-01");
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

    await expect(createMember(memberFormData())).rejects.toThrow(
      "redirect:/members/new?duplicate=phone-reuse",
    );

    expect(mocks.rpc).toHaveBeenCalledWith("save_member_with_contact", {
      member_id: null,
      member_data: expect.objectContaining({
        name: "홍길동",
        phone_number: "01012345678",
        group_id: "group-a",
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

    await expect(createMember(memberFormData("phone-reuse"))).rejects.toThrow(
      "redirect:/members?status=created&memberCode=A0001",
    );

    expect(mocks.rpc).toHaveBeenCalledWith(
      "save_member_with_contact",
      expect.objectContaining({ duplicate_confirmation: "CONFIRM_PHONE_REUSE" }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/members");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
