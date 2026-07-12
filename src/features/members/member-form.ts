import {
  MEMBER_STATUS_LABELS,
  type MemberStatus,
  validateMemberLifecycle,
} from "./member-model";
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
  memo: string | null;
};

export type MemberSaveResult =
  | { status: "saved"; memberCode: string }
  | {
      status: "confirmation-required";
      reason: "phone-reuse" | "name-without-phone";
    }
  | { status: "blocked" };

export type CsvParseResult =
  | { ok: true; members: MemberFormInput[] }
  | { ok: false; line: number; message: string };

const csvHeaderAliases: Readonly<
  Record<Exclude<keyof MemberFormInput, "duplicateConfirmation">, string[]>
> = {
  name: ["name", "이름"],
  phoneNumber: ["phone_number", "phoneNumber", "전화번호", "연락처"],
  groupId: ["group_id", "groupId", "그룹ID"],
  status: ["status", "상태"],
  joinedDate: ["joined_date", "joinedDate", "가입일"],
  withdrawnDate: ["withdrawn_date", "withdrawnDate", "탈퇴일"],
  memo: ["memo", "메모"],
};

export function parseMemberFormData(formData: FormData): MemberFormInput {
  return normalizeMemberInput({
    name: readFormString(formData, "name"),
    phoneNumber: readFormString(formData, "phoneNumber"),
    groupId: readFormString(formData, "groupId"),
    status: readFormString(formData, "status"),
    joinedDate: readFormString(formData, "joinedDate"),
    withdrawnDate: readFormString(formData, "withdrawnDate"),
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

export function parseMembersCsv(source: string): CsvParseResult {
  const rows = parseCsvRows(source);
  if (rows.length < 2) {
    return { ok: false, line: 1, message: "CSV에 회원 데이터가 없습니다." };
  }

  const headers = rows[0].map((header) => header.trim());
  const members: MemberFormInput[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.every((cell) => !cell.trim())) continue;

    const member = normalizeMemberInput({
      name: readCsvValue(headers, row, "name"),
      phoneNumber: readCsvValue(headers, row, "phoneNumber"),
      groupId: readCsvValue(headers, row, "groupId"),
      status: normalizeCsvStatus(readCsvValue(headers, row, "status")),
      joinedDate: readCsvValue(headers, row, "joinedDate"),
      withdrawnDate: readCsvValue(headers, row, "withdrawnDate"),
      memo: readCsvValue(headers, row, "memo"),
    });
    const errors = validateMemberForm(member);
    if (errors.length > 0) {
      return { ok: false, line: index + 1, message: errors[0] };
    }
    members.push(member);
  }

  return members.length > 0
    ? { ok: true, members }
    : { ok: false, line: 1, message: "CSV에 회원 데이터가 없습니다." };
}

function isDuplicateConfirmation(
  value: unknown,
): value is Exclude<DuplicateConfirmation, null> {
  return value === "phone-reuse" || value === "name-without-phone";
}

function normalizeCsvStatus(value: string | null) {
  if (!value) return value;
  return (
    Object.entries(MEMBER_STATUS_LABELS).find(
      ([key, label]) => key === value || label === value,
    )?.[0] ?? value
  );
}

function parseCsvRows(source: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];
    if (character === '"' && inQuotes && nextCharacter === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function readCsvValue(
  headers: string[],
  row: string[],
  field: Exclude<keyof MemberFormInput, "duplicateConfirmation">,
) {
  const index = headers.findIndex((header) =>
    csvHeaderAliases[field].includes(header),
  );
  return index < 0 ? null : (row[index] ?? null);
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

function isDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}
