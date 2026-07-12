import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberRecord } from "./member-model";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import {
  buildMemberSearchFilter,
  searchMemberIdsByPhone,
  toMemberListRow,
} from "./member-directory";

const memberRow: MemberRecord = {
  id: "member-id",
  memberCode: "A0012",
  groupId: "group-id",
  groupCode: "A",
  name: "김민수",
  status: "active",
  joinedDate: "2026-07-01",
  withdrawnDate: null,
  memo: "첫 등록",
  createdBy: null,
  updatedBy: null,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};

describe("member directory DTO", () => {
  it("일반 조회 DTO에는 연락처 원문 키가 존재하지 않는다", () => {
    const row = toMemberListRow(memberRow, "010-****-5678");

    expect(row.phoneDisplay).toBe("010-****-5678");
    expect(row).not.toHaveProperty("phoneNumber");
    expect(JSON.stringify(row)).not.toContain("01012345678");
  });

  it("검색어는 이름과 회원번호에만 적용한다", () => {
    const filter = buildMemberSearchFilter("M0012");

    expect(filter).toContain("name.ilike");
    expect(filter).toContain("member_code.ilike");
    expect(filter).not.toContain("phone");
  });
});

describe("searchMemberIdsByPhone", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
  });

  it("정규화한 전화번호를 전용 RPC에만 전달한다", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ member_id: "member-id" }],
      error: null,
    });
    mocks.createClient.mockResolvedValue({ rpc });
    const formData = new FormData();
    formData.set("phoneNumber", "010-1234-5678");

    await expect(searchMemberIdsByPhone(formData)).resolves.toEqual([
      "member-id",
    ]);
    expect(rpc).toHaveBeenCalledWith("search_members_by_phone", {
      phone_query: "01012345678",
    });
  });

  it("유효하지 않은 전화번호는 데이터베이스로 보내지 않는다", async () => {
    const rpc = vi.fn();
    mocks.createClient.mockResolvedValue({ rpc });
    const formData = new FormData();
    formData.set("phoneNumber", "1234");

    await expect(searchMemberIdsByPhone(formData)).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
