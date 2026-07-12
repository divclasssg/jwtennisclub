"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  type MemberFormInput,
  type MemberSaveResult,
  parseMemberFormData,
  parseMemberSaveResult,
  parseMembersCsv,
  toDatabaseDuplicateConfirmation,
  toMemberDatabaseInput,
  validateMemberForm,
} from "@/features/members/member-form";

const membersPath = "/members";
const memberCreatePath = "/members/new";
const maximumCsvRows = 200;

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

export async function createMember(formData: FormData) {
  const member = parseMemberFormData(formData);
  const errors = validateMemberForm(member);

  if (errors.length > 0) {
    redirect(buildRedirect(memberCreatePath, { error: firstValidationCode(errors) }));
  }

  const { supabase } = await getAuthenticatedUserId();
  const result = await saveMember(supabase, null, member);

  if (!result) {
    redirect(buildRedirect(memberCreatePath, { error: "save-failed" }));
  }

  redirectForDuplicateResult(result, memberCreatePath);

  revalidatePath(membersPath);
  redirect(
    buildRedirect(membersPath, {
      status: "created",
      memberCode: result.memberCode,
    }),
  );
}

export async function updateMember(formData: FormData) {
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
  const result = await saveMember(supabase, memberId, member);

  if (!result) {
    redirect(buildRedirect(editPath, { error: "save-failed" }));
  }

  redirectForDuplicateResult(result, editPath);

  revalidatePath(membersPath);
  revalidatePath(editPath);
  redirect(buildRedirect(membersPath, { status: "updated" }));
}

export async function importMembersCsv(formData: FormData) {
  const file = formData.get("csvFile");

  if (!(file instanceof File) || file.size === 0) {
    redirect(buildRedirect(memberCreatePath, { importError: "missing-file" }));
  }

  const parsed = parseMembersCsv(await file.text());

  if (!parsed.ok) {
    redirect(
      buildRedirect(memberCreatePath, {
        importError: "invalid-csv",
        line: parsed.line,
      }),
    );
  }

  if (parsed.members.length > maximumCsvRows) {
    redirect(buildRedirect(memberCreatePath, { importError: "too-many-rows" }));
  }

  const { supabase } = await getAuthenticatedUserId();
  for (let index = 0; index < parsed.members.length; index += 1) {
    const result = await saveMember(supabase, null, parsed.members[index]);
    if (!result || result.status !== "saved") {
      redirect(
        buildRedirect(memberCreatePath, {
          importError:
            result?.status === "confirmation-required"
              ? result.reason
              : "save-failed",
          line: index + 2,
        }),
      );
    }
  }

  revalidatePath(membersPath);
  redirect(
    buildRedirect(membersPath, {
      status: "imported",
      count: parsed.members.length,
    }),
  );
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
): Promise<MemberSaveResult | null> {
  const { data, error } = await supabase.rpc("save_member_with_contact", {
    member_id: memberId,
    member_data: toMemberDatabaseInput(member),
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

function redirectForDuplicateResult(
  result: MemberSaveResult,
  formPath: string,
): asserts result is Extract<MemberSaveResult, { status: "saved" }> {
  if (result.status === "confirmation-required") {
    redirect(buildRedirect(formPath, { duplicate: result.reason }));
  }

  if (result.status === "blocked") {
    redirect(buildRedirect(formPath, { error: "duplicate-member" }));
  }
}
