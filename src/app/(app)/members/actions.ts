"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  parseMemberFormData,
  parseMembersCsv,
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

  const { supabase, userId } = await getAuthenticatedUserId();
  const { error } = await supabase.from("members").insert({
    ...toMemberDatabaseInput(member),
    created_by: userId,
    updated_by: userId,
  });

  if (error) {
    redirect(buildRedirect(memberCreatePath, { error: "save-failed" }));
  }

  revalidatePath(membersPath);
  redirect(buildRedirect(membersPath, { status: "created" }));
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

  const { supabase, userId } = await getAuthenticatedUserId();
  const { error } = await supabase
    .from("members")
    .update({
      ...toMemberDatabaseInput(member),
      updated_by: userId,
    })
    .eq("id", memberId);

  if (error) {
    redirect(buildRedirect(editPath, { error: "save-failed" }));
  }

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

  const { supabase, userId } = await getAuthenticatedUserId();
  const { error } = await supabase.from("members").insert(
    parsed.members.map((member) => ({
      ...toMemberDatabaseInput(member),
      created_by: userId,
      updated_by: userId,
    })),
  );

  if (error) {
    redirect(buildRedirect(memberCreatePath, { importError: "save-failed" }));
  }

  revalidatePath(membersPath);
  redirect(
    buildRedirect(membersPath, {
      status: "imported",
      count: parsed.members.length,
    }),
  );
}
