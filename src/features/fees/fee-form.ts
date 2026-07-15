import {
  DEFAULT_MONTHLY_FEE_AMOUNT,
  isValidDateInput,
  normalizePeriodMonth,
} from "./fee-model";

export type FeePaymentFormInput = {
  memberId: string;
  periodMonth: string;
  amount: number;
  paidDate: string;
  memo: string | null;
};

export type FeePaymentDatabaseInput = {
  member_id: string;
  period_month: string;
  amount: number;
  paid_date: string;
  memo: string | null;
};

export type FeePaymentCsvInput = Omit<FeePaymentFormInput, "memberId"> & {
  memberCode: string;
};

export type FeePaymentCsvParseResult =
  | {
      ok: true;
      payments: FeePaymentCsvInput[];
      sourceLines: number[];
    }
  | {
      ok: false;
      line: number;
      message: string;
    };

const csvHeaderAliases: Readonly<Record<keyof FeePaymentCsvInput, string[]>> = {
  memberCode: ["member_code", "memberCode", "회원번호"],
  periodMonth: ["period_month", "periodMonth", "납부월"],
  amount: ["amount", "금액"],
  paidDate: ["paid_date", "paidDate", "납부일"],
  memo: ["memo", "메모"],
};

export function parseFeePaymentFormData(
  formData: FormData,
): FeePaymentFormInput {
  return normalizeFeePaymentInput({
    memberId: readFormString(formData, "memberId"),
    periodMonth: readFormString(formData, "periodMonth"),
    amount: readFormString(formData, "amount"),
    paidDate: readFormString(formData, "paidDate"),
    memo: readFormString(formData, "memo"),
  });
}

export function normalizeFeePaymentInput(input: {
  memberId?: string | null;
  periodMonth?: string | null;
  amount?: string | number | null;
  paidDate?: string | null;
  memo?: string | null;
}): FeePaymentFormInput {
  const numericAmount =
    typeof input.amount === "number"
      ? input.amount
      : Number.parseInt(input.amount?.trim() ?? "", 10);

  return {
    memberId: normalizeRequiredText(input.memberId),
    periodMonth: normalizePeriodMonth(input.periodMonth),
    amount: Number.isFinite(numericAmount)
      ? numericAmount
      : DEFAULT_MONTHLY_FEE_AMOUNT,
    paidDate: normalizeRequiredText(input.paidDate),
    memo: normalizeOptionalText(input.memo),
  };
}

export function parseFeePaymentsCsv(source: string): FeePaymentCsvParseResult {
  const rows = parseCsvRows(source);

  if (rows.length < 2) {
    return { ok: false, line: 1, message: "CSV에 회비 납부 데이터가 없습니다." };
  }

  const headers = rows[0].cells.map((header) => header.trim());
  const requiredFields: (keyof FeePaymentCsvInput)[] = [
    "memberCode",
    "periodMonth",
    "amount",
    "paidDate",
  ];

  if (requiredFields.some((field) => !hasCsvHeader(headers, field))) {
    return { ok: false, line: 1, message: "CSV 필수 헤더를 확인하세요." };
  }
  const payments: FeePaymentCsvInput[] = [];
  const sourceLines: number[] = [];

  for (let index = 1; index < rows.length; index += 1) {
    const { cells: row, sourceLine } = rows[index];

    if (row.every((cell) => !cell.trim())) {
      continue;
    }

    const payment = normalizeFeePaymentCsvInput({
      memberCode: readCsvValue(headers, row, "memberCode"),
      periodMonth: readCsvValue(headers, row, "periodMonth"),
      amount: readCsvValue(headers, row, "amount"),
      paidDate: readCsvValue(headers, row, "paidDate"),
      memo: readCsvValue(headers, row, "memo"),
    });
    const errors = validateFeePaymentCsvInput(payment);

    if (errors.length > 0) {
      return {
        ok: false,
        line: sourceLine,
        message: errors[0],
      };
    }

    payments.push(payment);
    sourceLines.push(sourceLine);
  }

  if (payments.length === 0) {
    return { ok: false, line: 1, message: "CSV에 회비 납부 데이터가 없습니다." };
  }

  return { ok: true, payments, sourceLines };
}

export function validateFeePaymentForm(input: FeePaymentFormInput): string[] {
  const errors: string[] = [];

  if (!input.memberId) {
    errors.push("회원을 선택하세요.");
  }

  if (!isValidDateInput(input.periodMonth)) {
    errors.push("납부 월을 YYYY-MM 형식으로 입력하세요.");
  }

  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    errors.push("납부 금액은 1원 이상의 정수로 입력하세요.");
  }

  if (input.amount > 999999999) {
    errors.push("납부 금액이 너무 큽니다.");
  }

  if (!isValidDateInput(input.paidDate)) {
    errors.push("납부일을 YYYY-MM-DD 형식으로 입력하세요.");
  }

  if (input.memo && input.memo.length > 500) {
    errors.push("메모는 500자 이하로 입력하세요.");
  }

  return errors;
}

export function toFeePaymentDatabaseInput(
  input: FeePaymentFormInput,
): FeePaymentDatabaseInput {
  return {
    member_id: input.memberId,
    period_month: input.periodMonth,
    amount: input.amount,
    paid_date: input.paidDate,
    memo: input.memo,
  };
}

function normalizeFeePaymentCsvInput(input: {
  memberCode?: string | null;
  periodMonth?: string | null;
  amount?: string | number | null;
  paidDate?: string | null;
  memo?: string | null;
}): FeePaymentCsvInput {
  const payment = normalizeFeePaymentInput({
    memberId: "csv-member-placeholder",
    periodMonth: input.periodMonth,
    amount: input.amount,
    paidDate: input.paidDate,
    memo: input.memo,
  });

  return {
    memberCode: normalizeRequiredText(input.memberCode).toUpperCase(),
    periodMonth: payment.periodMonth,
    amount: payment.amount,
    paidDate: payment.paidDate,
    memo: payment.memo,
  };
}

function validateFeePaymentCsvInput(input: FeePaymentCsvInput) {
  const errors: string[] = [];

  if (!input.memberCode) {
    errors.push("회원번호를 입력하세요.");
  }

  errors.push(
    ...validateFeePaymentForm({
      memberId: "csv-member-placeholder",
      periodMonth: input.periodMonth,
      amount: input.amount,
      paidDate: input.paidDate,
      memo: input.memo,
    }).filter((error) => !error.includes("회원")),
  );

  return errors;
}

function parseCsvRows(source: string) {
  const rows: { cells: string[]; sourceLine: number }[] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let currentLine = 1;
  let rowSourceLine = 1;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (character === "\"" && inQuotes && nextCharacter === "\"") {
      cell += "\"";
      index += 1;
      continue;
    }

    if (character === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (character === "\n" || character === "\r") {
      const newline = character === "\r" && nextCharacter === "\n" ? "\r\n" : character;

      if (newline === "\r\n") {
        index += 1;
      }

      currentLine += 1;

      if (inQuotes) {
        cell += newline;
        continue;
      }

      row.push(cell);
      rows.push({ cells: row, sourceLine: rowSourceLine });
      row = [];
      cell = "";
      rowSourceLine = currentLine;
      continue;
    }

    cell += character;
  }

  row.push(cell);
  rows.push({ cells: row, sourceLine: rowSourceLine });

  return rows;
}

function readCsvValue(
  headers: string[],
  row: string[],
  field: keyof FeePaymentCsvInput,
) {
  const aliases = csvHeaderAliases[field];
  const index = headers.findIndex((header) => aliases.includes(header));

  if (index < 0) {
    return null;
  }

  return row[index] ?? null;
}

function hasCsvHeader(headers: string[], field: keyof FeePaymentCsvInput) {
  return headers.some((header) => csvHeaderAliases[field].includes(header));
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
