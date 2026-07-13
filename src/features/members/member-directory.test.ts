import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberRecord } from "./member-model";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  currentOperatorHasPermission: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/features/auth/operator-context", () => ({
  currentOperatorHasPermission: mocks.currentOperatorHasPermission,
}));

import {
  buildMemberSearchFilter,
  loadMemberDirectory,
  loadMemberDirectoryPage,
  loadMemberForEdit,
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

const databaseMemberRow = {
  id: "member-id",
  member_code: "A0012",
  group_id: "group-id",
  member_groups: { code: "A" },
  name: "김민수",
  operator_profile_id: "profile-id",
  status: "active",
  joined_date: "2026-07-01",
  withdrawn_date: null,
  memo: "첫 등록",
};

function queryResult(data: unknown) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    or: vi.fn(),
    maybeSingle: vi.fn(),
    then: (resolve: (value: unknown) => void) => resolve({ data, error: null }),
  };

  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.or.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data, error: null });
  return query;
}

function mockDirectoryClient(options: {
  members: unknown[];
  canManageContacts: boolean;
  contactData?: unknown[];
  positionData?: unknown[];
}) {
  mocks.currentOperatorHasPermission.mockResolvedValue(
    options.canManageContacts,
  );
  const members = queryResult(options.members);
  const contacts = queryResult(options.contactData ?? []);
  const positions = queryResult(options.positionData ?? []);
  members.maybeSingle.mockResolvedValue({
    data: options.members[0] ?? null,
    error: null,
  });
  contacts.maybeSingle.mockResolvedValue({
    data: options.contactData?.[0] ?? null,
    error: null,
  });
  const rpc = vi.fn().mockResolvedValue({
    data: options.contactData ?? [],
    error: null,
  });
  const from = vi.fn((table: string) => {
    if (table === "profiles") return positions;
    if (table === "members") return members;
    if (table === "member_contacts") return contacts;
    throw new Error(`Unexpected table: ${table}`);
  });

  mocks.createClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-id" } },
        error: null,
      }),
    },
    from,
    rpc,
  });

  return { contacts, from, members, positions, rpc };
}

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

describe("member directory page RPC", () => {
  it("loads rows and permissions with exactly one Supabase call", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        can_create: true,
        can_update: false,
        members: [{
          ...databaseMemberRow,
          club_position_label: "총무",
          phone_display: "010-****-5678",
          group_code: "A",
        }],
      },
      error: null,
    });
    mocks.createClient.mockResolvedValue({ rpc });

    const result = await loadMemberDirectoryPage({ q: " 김민수 ", status: "active" });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_member_directory_page", {
      requested_status: "active",
      search_query: "김민수",
    });
    expect(result.canCreate).toBe(true);
    expect(result.canUpdate).toBe(false);
    expect(result.members[0]).toMatchObject({ name: "김민수", phoneDisplay: "010-****-5678" });
  });
});

describe("member directory contact query scope", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.currentOperatorHasPermission.mockReset();
  });

  it("연락처 관리자는 필터 결과 회원 ID만 원문 연락처 조회에 전달한다", async () => {
    const { contacts } = mockDirectoryClient({
      members: [databaseMemberRow],
      canManageContacts: true,
      contactData: [{ member_id: "member-id", phone_number: "01012345678" }],
    });

    await loadMemberDirectory({ q: "A0012" });

    expect(contacts.in).toHaveBeenCalledWith("member_id", ["member-id"]);
  });

  it("운영진 회원에는 프로필의 직책 라벨을 결합한다", async () => {
    const { positions } = mockDirectoryClient({
      members: [databaseMemberRow],
      canManageContacts: false,
      contactData: [],
      positionData: [
        { id: "profile-id", club_positions: { label: "총무", sort_order: 30 } },
      ],
    });

    const [member] = await loadMemberDirectory({ status: "active" });

    expect(positions.in).toHaveBeenCalledWith("id", ["profile-id"]);
    expect(member.clubPositionLabel).toBe("총무");
  });

  it("회원 목록을 ID 오름차순으로 정렬한다", async () => {
    mockDirectoryClient({
      members: [
        { ...databaseMemberRow, id: "member-2", member_code: "JW-000002" },
        { ...databaseMemberRow, id: "member-1", member_code: "JW-000001" },
      ],
      canManageContacts: false,
      contactData: [],
      positionData: [],
    });

    const members = await loadMemberDirectory({ status: "active" });

    expect(members.map((member) => member.memberCode)).toEqual([
      "JW-000001",
      "JW-000002",
    ]);
  });

  it("일반 조회자는 필터 결과 회원 ID만 마스킹 RPC에 전달한다", async () => {
    const { rpc } = mockDirectoryClient({
      members: [databaseMemberRow],
      canManageContacts: false,
      contactData: [{ member_id: "member-id", phone_masked: "010-****-5678" }],
    });

    await loadMemberDirectory({ status: "active" });

    expect(rpc).toHaveBeenCalledWith("get_masked_member_contacts", {
      member_ids: ["member-id"],
    });
  });

  it("필터 결과가 없으면 연락처를 조회하지 않는다", async () => {
    const { from, rpc } = mockDirectoryClient({
      members: [],
      canManageContacts: true,
    });

    await expect(loadMemberDirectory({ status: "active" })).resolves.toEqual([]);
    expect(from).not.toHaveBeenCalledWith("member_contacts");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("일반 조회자의 단일 편집은 해당 회원 ID만 마스킹 RPC에 전달한다", async () => {
    const { rpc } = mockDirectoryClient({
      members: [databaseMemberRow],
      canManageContacts: false,
      contactData: [{ member_id: "member-id", phone_masked: "010-****-5678" }],
    });

    await loadMemberForEdit("member-id");

    expect(rpc).toHaveBeenCalledWith("get_masked_member_contacts", {
      member_ids: ["member-id"],
    });
  });

  it("연락처 관리자의 단일 편집은 해당 회원 ID만 원문 연락처 조회에 전달한다", async () => {
    const { contacts } = mockDirectoryClient({
      members: [databaseMemberRow],
      canManageContacts: true,
      contactData: [{ member_id: "member-id", phone_number: "01012345678" }],
    });

    await loadMemberForEdit("member-id");

    expect(contacts.eq).toHaveBeenCalledWith("member_id", "member-id");
  });
});

describe("searchMemberIdsByPhone", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.currentOperatorHasPermission.mockReset();
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
