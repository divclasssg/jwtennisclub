import { z } from "zod";
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
} from "@/features/expenses/expense-model";

const SETTLEMENT_SCHEMA_VERSION = 1;
const FIRST_LEDGER_MONTH = "2026-07-01";
const PARSE_ERROR_MESSAGE = "월별 정산 데이터 형식이 올바르지 않습니다.";

const calendarDateSchema = z.string().refine(isCalendarDate);
const periodMonthSchema = calendarDateSchema.refine(
  (value) => value.endsWith("-01"),
);
const nonNegativeIntegerSchema = z.number().finite().int().nonnegative();
const positiveIntegerSchema = z.number().finite().int().positive();
const signedIntegerSchema = z.number().finite().int();
const expenseCategorySchema = z.enum(EXPENSE_CATEGORIES);

const databaseExpenseCategoryRowSchema = z
  .object({
    category: expenseCategorySchema,
    count: positiveIntegerSchema,
    amount: positiveIntegerSchema,
  })
  .strict();

const databaseExpenseRowSchema = z
  .object({
    expense_date: calendarDateSchema,
    category: expenseCategorySchema,
    description: z.string().trim().min(1).max(500),
    amount: positiveIntegerSchema,
  })
  .strict();

const databaseSnapshotSchema = z
  .object({
    schema_version: z.literal(SETTLEMENT_SCHEMA_VERSION),
    period_month: periodMonthSchema,
    monthly_fee_amount: positiveIntegerSchema,
    activity_member_count: nonNegativeIntegerSchema,
    fee_target_count: nonNegativeIntegerSchema,
    fully_paid_count: nonNegativeIntegerSchema,
    unpaid_count: nonNegativeIntegerSchema,
    billed_total: nonNegativeIntegerSchema,
    actual_fee_income: nonNegativeIntegerSchema,
    recognized_paid_total: nonNegativeIntegerSchema,
    adjustment_income: nonNegativeIntegerSchema,
    unpaid_total: nonNegativeIntegerSchema,
    expense_total: nonNegativeIntegerSchema,
    expense_count: nonNegativeIntegerSchema,
    attributed_net: signedIntegerSchema,
    opening_ledger_balance: signedIntegerSchema,
    closing_ledger_balance: signedIntegerSchema,
    expense_category_rows: z.array(databaseExpenseCategoryRowSchema),
    expense_rows: z.array(databaseExpenseRowSchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.period_month < FIRST_LEDGER_MONTH) {
      context.addIssue({ code: "custom", message: "ledger start month" });
    }

    if (
      value.period_month === FIRST_LEDGER_MONTH &&
      value.opening_ledger_balance !== 0
    ) {
      context.addIssue({ code: "custom", message: "first ledger opening balance" });
    }

    if (value.fee_target_count > value.activity_member_count) {
      context.addIssue({ code: "custom", message: "fee target count" });
    }

    if (value.fully_paid_count + value.unpaid_count !== value.fee_target_count) {
      context.addIssue({ code: "custom", message: "fee payment counts" });
    }

    if (value.billed_total !== value.monthly_fee_amount * value.fee_target_count) {
      context.addIssue({ code: "custom", message: "billed total" });
    }

    if (value.billed_total !== value.recognized_paid_total + value.unpaid_total) {
      context.addIssue({ code: "custom", message: "recognized payment total" });
    }

    if (value.actual_fee_income !== value.recognized_paid_total + value.adjustment_income) {
      context.addIssue({ code: "custom", message: "actual fee income" });
    }

    if (value.attributed_net !== value.actual_fee_income - value.expense_total) {
      context.addIssue({ code: "custom", message: "attributed net" });
    }

    if (
      value.closing_ledger_balance !==
      value.opening_ledger_balance + value.attributed_net
    ) {
      context.addIssue({ code: "custom", message: "closing ledger balance" });
    }

    const categoryRows = new Map<ExpenseCategory, { count: number; amount: number }>();
    for (const row of value.expense_category_rows) {
      if (categoryRows.has(row.category)) {
        context.addIssue({ code: "custom", message: "duplicate expense category" });
        continue;
      }

      categoryRows.set(row.category, row);
    }

    const categoryCount = value.expense_category_rows.reduce(
      (total, row) => total + row.count,
      0,
    );
    const categoryAmount = value.expense_category_rows.reduce(
      (total, row) => total + row.amount,
      0,
    );
    const expenseAmount = value.expense_rows.reduce(
      (total, row) => total + row.amount,
      0,
    );

    if (
      categoryCount !== value.expense_count ||
      value.expense_rows.length !== value.expense_count ||
      categoryAmount !== value.expense_total ||
      expenseAmount !== value.expense_total
    ) {
      context.addIssue({ code: "custom", message: "expense totals" });
    }

    for (const category of EXPENSE_CATEGORIES) {
      const expenseRows = value.expense_rows.filter(
        (row) => row.category === category,
      );
      const categoryRow = categoryRows.get(category);

      if (expenseRows.length === 0 && categoryRow) {
        context.addIssue({ code: "custom", message: "empty expense category" });
        continue;
      }

      if (expenseRows.length > 0 && !categoryRow) {
        context.addIssue({ code: "custom", message: "missing expense category" });
        continue;
      }

      if (
        categoryRow &&
        (categoryRow.count !== expenseRows.length ||
          categoryRow.amount !==
            expenseRows.reduce((total, row) => total + row.amount, 0))
      ) {
        context.addIssue({ code: "custom", message: "expense category totals" });
      }
    }

    const periodPrefix = value.period_month.slice(0, 7);
    if (
      value.expense_rows.some(
        (row) => !row.expense_date.startsWith(periodPrefix),
      )
    ) {
      context.addIssue({ code: "custom", message: "expense period month" });
    }
  });

const databaseClosingSchema = z
  .object({
    id: z.string().uuid(),
    period_month: periodMonthSchema,
    version: positiveIntegerSchema,
    status: z.literal("closed"),
    snapshot: databaseSnapshotSchema,
    closed_at: z.string().datetime({ offset: true }),
    closed_by: z.string().trim().min(1).max(100),
  })
  .strict();

const databasePageSchema = z
  .object({
    preview: databaseSnapshotSchema,
    active_closing: databaseClosingSchema.nullable(),
    can_close: z.boolean(),
    can_reopen: z.boolean(),
    close_blocked_reason: z.string().trim().min(1).max(200).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const closing = value.active_closing;
    if (!closing) {
      if (value.can_reopen) {
        context.addIssue({ code: "custom", message: "reopen without closing" });
      }
      return;
    }

    if (value.can_close) {
      context.addIssue({ code: "custom", message: "close with active closing" });
    }

    if (
      closing.period_month !== value.preview.period_month ||
      closing.snapshot.period_month !== value.preview.period_month
    ) {
      context.addIssue({ code: "custom", message: "closing period month" });
    }
  });

export type MonthlySettlementExpenseCategoryRow = {
  category: ExpenseCategory;
  count: number;
  amount: number;
};

export type MonthlySettlementExpenseRow = {
  expenseDate: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
};

export type MonthlySettlementSnapshot = {
  schemaVersion: typeof SETTLEMENT_SCHEMA_VERSION;
  periodMonth: string;
  monthlyFeeAmount: number;
  activityMemberCount: number;
  feeTargetCount: number;
  fullyPaidCount: number;
  unpaidCount: number;
  billedTotal: number;
  actualFeeIncome: number;
  recognizedPaidTotal: number;
  adjustmentIncome: number;
  unpaidTotal: number;
  expenseTotal: number;
  expenseCount: number;
  attributedNet: number;
  openingLedgerBalance: number;
  closingLedgerBalance: number;
  expenseCategoryRows: MonthlySettlementExpenseCategoryRow[];
  expenseRows: MonthlySettlementExpenseRow[];
};

export type MonthlySettlementClosing = {
  id: string;
  periodMonth: string;
  version: number;
  status: "closed";
  snapshot: MonthlySettlementSnapshot;
  closedAt: string;
  closedBy: string;
};

export type MonthlySettlementPage = {
  preview: MonthlySettlementSnapshot;
  activeClosing: MonthlySettlementClosing | null;
  canClose: boolean;
  canReopen: boolean;
  closeBlockedReason: string | null;
};

export function parseMonthlySettlementPage(value: unknown): MonthlySettlementPage {
  const parsed = databasePageSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(PARSE_ERROR_MESSAGE);
  }

  return {
    preview: mapSnapshot(parsed.data.preview),
    activeClosing: parsed.data.active_closing
      ? mapClosing(parsed.data.active_closing)
      : null,
    canClose: parsed.data.can_close,
    canReopen: parsed.data.can_reopen,
    closeBlockedReason: parsed.data.close_blocked_reason,
  };
}

export function canDownloadMonthlyReport(periodMonth: string, now: Date): boolean {
  if (!periodMonthSchema.safeParse(periodMonth).success || Number.isNaN(now.getTime())) {
    return false;
  }

  const [year, month] = periodMonth.slice(0, 7).split("-").map(Number);
  const nextMonth = new Date(Date.UTC(year, month, 1));
  const eligibleFrom = `${nextMonth.getUTCFullYear()}-${String(
    nextMonth.getUTCMonth() + 1,
  ).padStart(2, "0")}-01`;
  const seoulDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((parts, part) => {
      if (part.type !== "literal") {
        parts[part.type] = part.value;
      }
      return parts;
    }, {});
  const currentSeoulDate = `${seoulDate.year}-${seoulDate.month}-${seoulDate.day}`;

  return currentSeoulDate >= eligibleFrom;
}

function mapSnapshot(
  value: z.infer<typeof databaseSnapshotSchema>,
): MonthlySettlementSnapshot {
  return {
    schemaVersion: value.schema_version,
    periodMonth: value.period_month,
    monthlyFeeAmount: value.monthly_fee_amount,
    activityMemberCount: value.activity_member_count,
    feeTargetCount: value.fee_target_count,
    fullyPaidCount: value.fully_paid_count,
    unpaidCount: value.unpaid_count,
    billedTotal: value.billed_total,
    actualFeeIncome: value.actual_fee_income,
    recognizedPaidTotal: value.recognized_paid_total,
    adjustmentIncome: value.adjustment_income,
    unpaidTotal: value.unpaid_total,
    expenseTotal: value.expense_total,
    expenseCount: value.expense_count,
    attributedNet: value.attributed_net,
    openingLedgerBalance: value.opening_ledger_balance,
    closingLedgerBalance: value.closing_ledger_balance,
    expenseCategoryRows: value.expense_category_rows.map((row) => ({
      category: row.category,
      count: row.count,
      amount: row.amount,
    })),
    expenseRows: value.expense_rows.map((row) => ({
      expenseDate: row.expense_date,
      category: row.category,
      description: row.description,
      amount: row.amount,
    })),
  };
}

function mapClosing(
  value: z.infer<typeof databaseClosingSchema>,
): MonthlySettlementClosing {
  return {
    id: value.id,
    periodMonth: value.period_month,
    version: value.version,
    status: value.status,
    snapshot: mapSnapshot(value.snapshot),
    closedAt: value.closed_at,
    closedBy: value.closed_by,
  };
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
