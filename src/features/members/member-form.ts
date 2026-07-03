import {
  MEMBER_STATUS_LABELS,
  type MemberStatus,
  validateMemberLifecycle,
} from "./member-model";
import { isMemberStatus } from "./member-list";

export type MemberFormInput = {
  name: string;
  phoneLastFour: string | null;
  status: MemberStatus;
  joinedDate: string;
  withdrawnDate: string | null;
  withdrawalReason: string | null;
  memo: string | null;
};

export type MemberDatabaseInput = {
  name: string;
  phone_last_four: string | null;
  status: MemberStatus;
  joined_date: string;
  withdrawn_date: string | null;
  withdrawal_reason: string | null;
  memo: string | null;
};

export type CsvParseResult =
  | {
      ok: true;
      members: MemberFormInput[];
    }
  | {
      ok: false;
      line: number;
      message: string;
    };

const csvHeaderAliases: Readonly<Record<keyof MemberFormInput, string[]>> = {
  name: ["name", "이름"],
  phoneLastFour: ["phone_last_four", "phoneLastFour", "전화번호끝4자리"],
  status: ["status", "상태"],
  joinedDate: ["joined_date", "joinedDate", "가입일"],
  withdrawnDate: ["withdrawn_date", "withdrawnDate", "탈퇴일"],
  withdrawalReason: ["withdrawal_reason", "withdrawalReason", "탈퇴사유"],
  memo: ["memo", "메모"],
};

export function parseMemberFormData(formData: FormData): MemberFormInput {
  return normalizeMemberInput({
    name: readFormString(formData, "name"),
    phoneLastFour: readFormString(formData, "phoneLastFour"),
    status: readFormString(formData, "status"),
    joinedDate: readFormString(formData, "joinedDate"),
    withdrawnDate: readFormString(formData, "withdrawnDate"),
    withdrawalReason: readFormString(formData, "withdrawalReason"),
    memo: readFormString(formData, "memo"),
  });
}

export function normalizeMemberInput(input: {
  name?: string | null;
  phoneLastFour?: string | null;
  status?: string | null;
  joinedDate?: string | null;
  withdrawnDate?: string | null;
  withdrawalReason?: string | null;
  memo?: string | null;
}): MemberFormInput {
  const status = isMemberStatus(input.status) ? input.status : "active";

  return {
    name: normalizeRequiredText(input.name),
    phoneLastFour: normalizeOptionalText(input.phoneLastFour),
    status,
    joinedDate: normalizeRequiredText(input.joinedDate),
    withdrawnDate: normalizeOptionalText(input.withdrawnDate),
    withdrawalReason: normalizeOptionalText(input.withdrawalReason),
    memo: normalizeOptionalText(input.memo),
  };
}

export function validateMemberForm(input: MemberFormInput): string[] {
  const errors: string[] = [];

  if (!input.name) {
    errors.push("이름을 입력하세요.");
  }

  if (!isDateInput(input.joinedDate)) {
    errors.push("가입일을 YYYY-MM-DD 형식으로 입력하세요.");
  }

  if (input.phoneLastFour && !/^[0-9]{4}$/.test(input.phoneLastFour)) {
    errors.push("전화번호는 끝 4자리 숫자만 입력하세요.");
  }

  if (input.withdrawnDate && !isDateInput(input.withdrawnDate)) {
    errors.push("탈퇴일을 YYYY-MM-DD 형식으로 입력하세요.");
  }

  errors.push(...validateMemberLifecycle(input));
  return errors;
}

export function toMemberDatabaseInput(
  input: MemberFormInput,
): MemberDatabaseInput {
  return {
    name: input.name,
    phone_last_four: input.phoneLastFour,
    status: input.status,
    joined_date: input.joinedDate,
    withdrawn_date: input.withdrawnDate,
    withdrawal_reason: input.withdrawalReason,
    memo: input.memo,
  };
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

    if (row.every((cell) => !cell.trim())) {
      continue;
    }

    const member = normalizeMemberInput({
      name: readCsvValue(headers, row, "name"),
      phoneLastFour: readCsvValue(headers, row, "phoneLastFour"),
      status: normalizeCsvStatus(readCsvValue(headers, row, "status")),
      joinedDate: readCsvValue(headers, row, "joinedDate"),
      withdrawnDate: readCsvValue(headers, row, "withdrawnDate"),
      withdrawalReason: readCsvValue(headers, row, "withdrawalReason"),
      memo: readCsvValue(headers, row, "memo"),
    });
    const errors = validateMemberForm(member);

    if (errors.length > 0) {
      return {
        ok: false,
        line: index + 1,
        message: errors[0],
      };
    }

    members.push(member);
  }

  if (members.length === 0) {
    return { ok: false, line: 1, message: "CSV에 회원 데이터가 없습니다." };
  }

  return { ok: true, members };
}

function normalizeCsvStatus(value: string | null) {
  if (!value) {
    return value;
  }

  const status = Object.entries(MEMBER_STATUS_LABELS).find(
    ([key, label]) => key === value || label === value,
  )?.[0];

  return status ?? value;
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
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += character;
  }

  row.push(cell);
  rows.push(row);

  return rows;
}

function readCsvValue(
  headers: string[],
  row: string[],
  field: keyof MemberFormInput,
) {
  const aliases = csvHeaderAliases[field];
  const index = headers.findIndex((header) => aliases.includes(header));

  if (index < 0) {
    return null;
  }

  return row[index] ?? null;
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
  return trimmed ? trimmed : null;
}

function isDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}
