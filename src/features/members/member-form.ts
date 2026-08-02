import { type MemberStatus, validateMemberLifecycle } from "./member-model";
import { normalizePhoneNumber, validatePhoneNumber } from "./member-contact";
import { isMemberStatus } from "./member-list";

export type DuplicateConfirmation =
  | "phone-reuse"
  | "name-without-phone"
  | null;

export type MemberFormInput = {
  name: string;
  phoneNumber: string | null;
  groupId: string | null;
  status: MemberStatus;
  joinedDate: string;
  withdrawnDate: string | null;
  pauseStartMonth: string | null;
  activityStartMonth: string | null;
  memo: string | null;
  duplicateConfirmation: DuplicateConfirmation;
};

export type MemberActionState =
  | { status: "idle" }
  | {
      status: "confirmation-required";
      reason: Exclude<DuplicateConfirmation, null>;
      candidate: MemberFormInput;
    };

export const initialMemberActionState: MemberActionState = { status: "idle" };

export type MemberDatabaseInput = {
  name: string;
  phone_number?: string | null;
  group_id: string | null;
  status: MemberStatus;
  joined_date: string;
  withdrawn_date: string | null;
  pause_start_month: string | null;
  activity_start_month: string | null;
  memo: string | null;
};

export type MemberSaveResult =
  | { status: "saved"; memberCode: string }
  | {
      status: "confirmation-required";
      reason: "phone-reuse" | "name-without-phone";
    }
  | { status: "blocked" };


export function parseMemberFormData(formData: FormData): MemberFormInput {
  return normalizeMemberInput({
    name: readFormString(formData, "name"),
    phoneNumber: readFormString(formData, "phoneNumber"),
    groupId: readFormString(formData, "groupId"),
    status: readFormString(formData, "status"),
    joinedDate: readFormString(formData, "joinedDate"),
    withdrawnDate: readFormString(formData, "withdrawnDate"),
    pauseStartMonth: readFormString(formData, "pauseStartMonth"),
    activityStartMonth: readFormString(formData, "activityStartMonth"),
    memo: readFormString(formData, "memo"),
    duplicateConfirmation: readFormString(
      formData,
      "duplicateConfirmation",
    ),
  });
}

export function normalizeMemberInput(input: {
  name?: string | null;
  phoneNumber?: string | null;
  groupId?: string | null;
  status?: string | null;
  joinedDate?: string | null;
  withdrawnDate?: string | null;
  pauseStartMonth?: string | null;
  activityStartMonth?: string | null;
  memo?: string | null;
  duplicateConfirmation?: string | null;
}): MemberFormInput {
  return {
    name: normalizeRequiredText(input.name),
    phoneNumber: normalizePhoneNumber(input.phoneNumber),
    groupId: normalizeOptionalText(input.groupId),
    status: isMemberStatus(input.status) ? input.status : "active",
    joinedDate: normalizeRequiredText(input.joinedDate),
    withdrawnDate: normalizeOptionalText(input.withdrawnDate),
    pauseStartMonth: normalizePauseStartMonth(input.pauseStartMonth),
    activityStartMonth: normalizeActivityStartMonth(input.activityStartMonth),
    memo: normalizeOptionalText(input.memo),
    duplicateConfirmation: isDuplicateConfirmation(input.duplicateConfirmation)
      ? input.duplicateConfirmation
      : null,
  };
}

export function validateMemberForm(input: MemberFormInput): string[] {
  const errors: string[] = [];

  if (!input.name) errors.push("이름을 입력하세요.");
  if (!isDateInput(input.joinedDate)) {
    errors.push("가입일을 YYYY-MM-DD 형식으로 입력하세요.");
  }
  errors.push(...validatePhoneNumber(input.phoneNumber));
  if (input.withdrawnDate && !isDateInput(input.withdrawnDate)) {
    errors.push("탈퇴일을 YYYY-MM-DD 형식으로 입력하세요.");
  }
  if (input.pauseStartMonth && !isPauseStartMonth(input.pauseStartMonth)) {
    errors.push("휴회 시작 월을 YYYY-MM 형식으로 입력하세요.");
  }
  if (
    input.activityStartMonth &&
    !isActivityStartMonth(input.activityStartMonth)
  ) {
    errors.push("활동 시작 월을 YYYY-MM 형식으로 입력하세요.");
  }

  errors.push(...validateMemberLifecycle(input));
  return errors;
}

export function toMemberDatabaseInput(
  input: MemberFormInput,
  options: { includeContact?: boolean } = {},
): MemberDatabaseInput {
  const databaseInput: MemberDatabaseInput = {
    name: input.name,
    group_id: input.groupId,
    status: input.status,
    joined_date: input.joinedDate,
    withdrawn_date: input.withdrawnDate,
    pause_start_month: input.pauseStartMonth,
    activity_start_month: input.activityStartMonth,
    memo: input.memo,
  };
  if (options.includeContact !== false) {
    databaseInput.phone_number = input.phoneNumber;
  }
  return databaseInput;
}

export function toDatabaseDuplicateConfirmation(
  confirmation: DuplicateConfirmation,
): "CONFIRM_PHONE_REUSE" | "CONFIRM_NAME_ONLY" | null {
  if (confirmation === "phone-reuse") return "CONFIRM_PHONE_REUSE";
  if (confirmation === "name-without-phone") return "CONFIRM_NAME_ONLY";
  return null;
}

export function parseMemberSaveResult(value: unknown): MemberSaveResult {
  if (!value || typeof value !== "object" || !("status" in value)) {
    throw new Error("Invalid member save result");
  }

  const result = value as { status: unknown; member_code?: unknown };
  if (result.status === "SAVED" && typeof result.member_code === "string") {
    return { status: "saved", memberCode: result.member_code };
  }
  if (result.status === "PHONE_REUSE_CONFIRMATION_REQUIRED") {
    return { status: "confirmation-required", reason: "phone-reuse" };
  }
  if (result.status === "NAME_ONLY_CONFIRMATION_REQUIRED") {
    return { status: "confirmation-required", reason: "name-without-phone" };
  }
  if (result.status === "DUPLICATE_BLOCKED") return { status: "blocked" };

  throw new Error("Invalid member save result");
}

function isDuplicateConfirmation(
  value: unknown,
): value is Exclude<DuplicateConfirmation, null> {
  return value === "phone-reuse" || value === "name-without-phone";
}

function readFormString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}

function normalizeRequiredText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function normalizePauseStartMonth(value: string | null | undefined) {
  const month = normalizeOptionalText(value);
  if (!month || !isMonthInput(month)) return month;
  return `${month}-01`;
}

function normalizeActivityStartMonth(value: string | null | undefined) {
  const month = normalizeOptionalText(value);
  if (!month || !isMonthInput(month)) return month;
  return `${month}-01`;
}

function isDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function isMonthInput(value: string) {
  return /^\d{4}-\d{2}$/.test(value) && isDateInput(`${value}-01`);
}

function isPauseStartMonth(value: string) {
  return /^\d{4}-\d{2}-01$/.test(value) && isDateInput(value);
}

function isActivityStartMonth(value: string) {
  return /^\d{4}-\d{2}-01$/.test(value) && isDateInput(value);
}
