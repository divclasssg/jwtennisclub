import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  maskPhoneNumber,
  normalizePhoneNumber,
  validatePhoneNumber,
} from "./member-contact";
import { buildMemberSearchFilter } from "./member-list";
import type { MemberRecord, MemberStatus } from "./member-model";

export { buildMemberSearchFilter } from "./member-list";

export type MemberListRow = {
  id: string;
  memberCode: string;
  name: string;
  phoneDisplay: string;
  groupCode: string | null;
  status: MemberStatus;
  joinedDate: string;
  withdrawnDate: string | null;
  memo: string | null;
};

export type MemberEditRecord = MemberListRow & {
  phoneNumber: string | null;
  groupId: string | null;
  canManageContacts: boolean;
};

export type MemberGroupOption = { id: string; code: string };

export async function loadMemberGroups(): Promise<MemberGroupOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("member_groups")
    .select("id, code")
    .eq("is_active", true)
    .order("code", { ascending: true });

  if (error) throw new Error("회원 그룹을 불러오지 못했습니다.");
  return (data ?? []) as MemberGroupOption[];
}

type MemberDatabaseRow = {
  id: string;
  member_code: string;
  member_groups: { code: string } | { code: string }[] | null;
  name: string;
  status: MemberStatus;
  joined_date: string;
  withdrawn_date: string | null;
  memo: string | null;
};

type MemberEditDatabaseRow = MemberDatabaseRow & {
  group_id: string | null;
};

type ContactDisplayRow = {
  member_id: string;
  phone_masked?: string | null;
  phone_number?: string | null;
};

function relatedGroupCode(value: MemberDatabaseRow["member_groups"]) {
  const group = Array.isArray(value) ? value[0] : value;
  return group?.code ?? null;
}

function mapMemberRecord(row: MemberEditDatabaseRow): MemberRecord {
  return {
    id: row.id,
    memberCode: row.member_code,
    groupId: row.group_id,
    groupCode: relatedGroupCode(row.member_groups),
    name: row.name,
    status: row.status,
    joinedDate: row.joined_date,
    withdrawnDate: row.withdrawn_date,
    memo: row.memo,
    createdBy: null,
    updatedBy: null,
    createdAt: "",
    updatedAt: "",
  };
}

function mapMemberListRow(
  row: MemberDatabaseRow,
  phoneDisplay: string | null,
): MemberListRow {
  return {
    id: row.id,
    memberCode: row.member_code,
    name: row.name,
    phoneDisplay: phoneDisplay ?? maskPhoneNumber(null),
    groupCode: relatedGroupCode(row.member_groups),
    status: row.status,
    joinedDate: row.joined_date,
    withdrawnDate: row.withdrawn_date,
    memo: row.memo,
  };
}

function formatPhoneNumber(value: string | null) {
  const normalized = normalizePhoneNumber(value);

  if (!normalized) {
    return maskPhoneNumber(null);
  }

  const middleLength = normalized.length - 7;
  return `${normalized.slice(0, 3)}-${normalized.slice(3, 3 + middleLength)}-${normalized.slice(-4)}`;
}

export function toMemberListRow(
  member: MemberRecord,
  phoneDisplay: string | null,
): MemberListRow {
  return {
    id: member.id,
    memberCode: member.memberCode,
    name: member.name,
    phoneDisplay: phoneDisplay ?? maskPhoneNumber(null),
    groupCode: member.groupCode,
    status: member.status,
    joinedDate: member.joinedDate,
    withdrawnDate: member.withdrawnDate,
    memo: member.memo,
  };
}

export async function canManageMemberContacts(
  suppliedClient?: Awaited<ReturnType<typeof createClient>>,
) {
  const supabase = suppliedClient ?? await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return false;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.role_id) {
    return false;
  }

  const { data: permission, error: permissionError } = await supabase
    .from("role_permissions")
    .select("permission")
    .eq("role_id", profile.role_id)
    .eq("permission", "members.contacts.manage")
    .maybeSingle();

  if (permissionError) {
    throw new Error("회원 연락처 권한을 확인하지 못했습니다.");
  }

  return permission?.permission === "members.contacts.manage";
}

async function loadContactDisplays(
  supabase: Awaited<ReturnType<typeof createClient>>,
  canManageContacts: boolean,
  memberIds: string[],
) {
  const result = canManageContacts
    ? await supabase
        .from("member_contacts")
        .select("member_id, phone_number")
        .in("member_id", memberIds)
    : await supabase.rpc("get_masked_member_contacts", {
        member_ids: memberIds,
      });

  if (result.error) {
    throw new Error("회원 연락처를 불러오지 못했습니다.");
  }

  return new Map(
    ((result.data ?? []) as ContactDisplayRow[]).map((contact) => [
      contact.member_id,
      canManageContacts
        ? formatPhoneNumber(contact.phone_number ?? null)
        : (contact.phone_masked ?? maskPhoneNumber(null)),
    ]),
  );
}

export async function loadMemberDirectory(input: {
  q?: string;
  status?: MemberStatus;
  group?: string;
}): Promise<MemberListRow[]> {
  const supabase = await createClient();
  const canManageContacts = await canManageMemberContacts(supabase);
  const groupRelation = input.group && input.group !== "none" ? "member_groups!inner(code)" : "member_groups(code)";
  let request = supabase
    .from("members")
    .select(
      `id, member_code, ${groupRelation}, name, status, joined_date, withdrawn_date, memo`,
    )
    .order("name", { ascending: true });

  if (input.status) {
    request = request.eq("status", input.status);
  }

  if (input.group === "none") {
    request = request.is("group_id", null);
  } else if (input.group) {
    request = request.eq("member_groups.code", input.group);
  }

  const query = input.q?.trim();
  if (query) {
    request = request.or(buildMemberSearchFilter(query));
  }

  const { data, error } = await request;

  if (error) {
    throw new Error("회원 목록을 불러오지 못했습니다.");
  }

  const rows = (data ?? []) as unknown as MemberDatabaseRow[];
  if (rows.length === 0) {
    return [];
  }

  const contactDisplays = await loadContactDisplays(
    supabase,
    canManageContacts,
    rows.map((row) => row.id),
  );

  return rows.map((row) =>
    mapMemberListRow(row, contactDisplays.get(row.id) ?? null),
  );
}

export async function loadMemberForEdit(
  id: string,
): Promise<MemberEditRecord | null> {
  const supabase = await createClient();
  const canManageContacts = await canManageMemberContacts(supabase);
  const { data, error } = await supabase
    .from("members")
    .select(
      "id, member_code, group_id, member_groups(code), name, status, joined_date, withdrawn_date, memo",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error("회원 정보를 불러오지 못했습니다.");
  }

  if (!data) {
    return null;
  }

  let phoneNumber: string | null = null;
  let phoneDisplay: string | null = null;

  if (canManageContacts) {
    const { data: contact, error: contactError } = await supabase
      .from("member_contacts")
      .select("phone_number")
      .eq("member_id", id)
      .maybeSingle();

    if (contactError) {
      throw new Error("회원 연락처를 불러오지 못했습니다.");
    }

    phoneNumber = contact?.phone_number ?? null;
    phoneDisplay = formatPhoneNumber(phoneNumber);
  } else {
    const displays = await loadContactDisplays(supabase, false, [id]);
    phoneDisplay = displays.get(id) ?? null;
  }

  const member = mapMemberRecord(data as unknown as MemberEditDatabaseRow);
  return {
    ...toMemberListRow(member, phoneDisplay),
    phoneNumber,
    groupId: member.groupId,
    canManageContacts,
  };
}

export async function searchMemberIdsByPhone(
  formData: FormData,
): Promise<string[]> {
  "use server";

  const value = formData.get("phoneNumber");
  const phoneNumber = normalizePhoneNumber(
    typeof value === "string" ? value : null,
  );

  if (validatePhoneNumber(phoneNumber).length > 0 || !phoneNumber) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_members_by_phone", {
    phone_query: phoneNumber,
  });

  if (error) {
    throw new Error("연락처로 회원을 검색하지 못했습니다.");
  }

  return ((data ?? []) as { member_id: string }[]).map(
    (row) => row.member_id,
  );
}
