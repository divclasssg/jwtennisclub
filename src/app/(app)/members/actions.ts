"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  type MemberFormInput,
  type MemberActionState,
  type MemberSaveResult,
  parseMemberFormData,
  parseMemberSaveResult,
  toDatabaseDuplicateConfirmation,
  toMemberDatabaseInput,
  validateMemberForm,
} from "@/features/members/member-form";

const membersPath = "/members";
const memberCreatePath = "/members/new";

function buildRedirect(path: string, params: Record<string, string | number>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value));
  }

  return `${path}?${searchParams.toString()}`;
}

function firstValidationCode(errors: string[]) {
  if (errors.some((error) => error.includes("이름"))) {
    return "invalid-name";
  }

  if (errors.some((error) => error.includes("전화번호"))) {
    return "invalid-phone";
  }

  if (errors.some((error) => error.includes("가입일"))) {
    return "invalid-joined-date";
  }

  if (errors.some((error) => error.includes("탈퇴일"))) {
    return "invalid-withdrawn-date";
  }

  return "invalid-member";
}

async function getAuthenticatedUserId() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { supabase, userId: user.id };
}

export async function createMember(
  _previousState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const member = parseMemberFormData(formData);
  const errors = validateMemberForm(member);

  if (errors.length > 0) {
    redirect(buildRedirect(memberCreatePath, { error: firstValidationCode(errors) }));
  }

  const { supabase } = await getAuthenticatedUserId();
  const result = await saveMember(supabase, null, member, true);

  if (!result) {
    redirect(buildRedirect(memberCreatePath, { error: "save-failed" }));
  }

  const confirmationState = confirmationStateFor(result, member, formData);
  if (confirmationState) return confirmationState;
  redirectForBlockedResult(result, memberCreatePath);

  revalidatePath(membersPath);
  redirect(
    buildRedirect(membersPath, {
      status: "created",
      memberCode: result.memberCode,
    }),
  );
}

export async function updateMember(
  _previousState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const memberId = String(formData.get("id") ?? "");
  const member = parseMemberFormData(formData);
  const errors = validateMemberForm(member);
  const editPath = `${membersPath}/${memberId}/edit`;

  if (!memberId) {
    redirect(buildRedirect(membersPath, { error: "missing-member" }));
  }

  if (errors.length > 0) {
    redirect(buildRedirect(editPath, { error: firstValidationCode(errors) }));
  }

  const { supabase } = await getAuthenticatedUserId();
  const result = await saveMember(
    supabase,
    memberId,
    member,
    formData.has("phoneNumber"),
  );

  if (!result) {
    redirect(buildRedirect(editPath, { error: "save-failed" }));
  }

  const confirmationState = confirmationStateFor(result, member, formData);
  if (confirmationState) return confirmationState;
  redirectForBlockedResult(result, editPath);

  revalidatePath(membersPath);
  revalidatePath(editPath);
  redirect(buildRedirect(membersPath, { status: "updated" }));
}

export async function importMembersCsv(formData: FormData) {
  void formData;
  redirect(buildRedirect(memberCreatePath, { importError: "import-disabled" }));
}

type MemberRpcClient = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

async function saveMember(
  supabase: MemberRpcClient,
  memberId: string | null,
  member: MemberFormInput,
  includeContact: boolean,
): Promise<MemberSaveResult | null> {
  const { data, error } = await supabase.rpc("save_member_with_contact", {
    member_id: memberId,
    member_data: toMemberDatabaseInput(member, { includeContact }),
    duplicate_confirmation: toDatabaseDuplicateConfirmation(
      member.duplicateConfirmation,
    ),
  });

  if (error) return null;

  try {
    return parseMemberSaveResult(data);
  } catch {
    return null;
  }
}

function confirmationStateFor(
  result: MemberSaveResult,
  candidate: MemberFormInput,
  formData: FormData,
): MemberActionState | null {
  if (result.status === "confirmation-required") {
    return {
      status: "confirmation-required",
      reason: result.reason,
      candidate: {
        ...candidate,
        phoneNumber: formData.has("phoneNumber")
          ? String(formData.get("phoneNumber") ?? "")
          : candidate.phoneNumber,
      },
    };
  }
  return null;
}

function redirectForBlockedResult(
  result: MemberSaveResult,
  formPath: string,
): asserts result is Extract<MemberSaveResult, { status: "saved" }> {
  if (result.status === "blocked") {
    redirect(buildRedirect(formPath, { error: "duplicate-member" }));
  }
}
