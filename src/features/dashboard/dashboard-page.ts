import { z } from "zod";

const FIRST_LEDGER_MONTH = "2026-07-01";
const PARSE_ERROR_MESSAGE = "대시보드 데이터 형식이 올바르지 않습니다.";

const calendarDateSchema = z.string().refine(isCalendarDate);
const periodMonthSchema = calendarDateSchema.refine((value) => value.endsWith("-01"));
const timestampSchema = z.string().datetime({ offset: true });
const nonNegativeIntegerSchema = z.number().finite().int().nonnegative();
const signedIntegerSchema = z.number().finite().int();
const positiveIntegerSchema = z.number().finite().int().positive();

const financialSummaryShape = {
  billed_total: nonNegativeIntegerSchema,
  actual_fee_income: nonNegativeIntegerSchema,
  expense_total: nonNegativeIntegerSchema,
  attributed_net: signedIntegerSchema,
  fully_paid_count: nonNegativeIntegerSchema,
  fee_target_count: nonNegativeIntegerSchema,
  unpaid_count: nonNegativeIntegerSchema,
  unpaid_total: nonNegativeIntegerSchema,
  opening_ledger_balance: signedIntegerSchema,
  closing_ledger_balance: signedIntegerSchema,
};

const databaseFinancialSummarySchema = z
  .object(financialSummaryShape)
  .strict()
  .superRefine(validateFinancialSummary);

const databaseMembersSchema = z.object({
  active_count: nonNegativeIntegerSchema,
  upcoming_count: nonNegativeIntegerSchema,
  paused_count: nonNegativeIntegerSchema,
  joined_this_month_count: nonNegativeIntegerSchema,
  paused_this_month_count: nonNegativeIntegerSchema,
  withdrawn_this_month_count: nonNegativeIntegerSchema,
}).strict();

const databaseClosingReferenceSchema = z.object({
  id: z.string().uuid(),
  closing_kind: z.enum(["interim", "final"]),
  version: positiveIntegerSchema,
  status: z.literal("closed"),
}).strict();

const databaseFinalReferenceSchema = databaseClosingReferenceSchema.extend({
  closing_kind: z.literal("final"),
});

const databaseInterimReferenceSchema = databaseClosingReferenceSchema.extend({
  closing_kind: z.literal("interim"),
});

const databaseAvailableFinanceSchema = z.object({
  status: z.literal("available"),
  blocked_reason: z.null(),
  source: z.enum(["final", "current"]),
  summary: databaseFinancialSummarySchema,
  active_final: databaseFinalReferenceSchema.nullable(),
  latest_interim: databaseInterimReferenceSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.source === "final" && value.active_final === null) {
    context.addIssue({ code: "custom", message: "final source requires final closing" });
  }

  if (value.source === "current" && value.active_final !== null) {
    context.addIssue({ code: "custom", message: "current source cannot have final closing" });
  }
});

const databaseBlockedFinanceSchema = z.object({
  status: z.literal("blocked"),
  blocked_reason: z.enum([
    "member-activity-start-required",
    "prior-final-closing-required",
    "invalid-public-expense-description",
  ]),
  source: z.null(),
  summary: z.null(),
  active_final: z.null(),
  latest_interim: databaseInterimReferenceSchema.nullable(),
}).strict();

const databaseTrendSchema = z.object({
  period_month: periodMonthSchema,
  source: z.enum(["final", "current"]),
  actual_fee_income: nonNegativeIntegerSchema,
  expense_total: nonNegativeIntegerSchema,
  closing_ledger_balance: signedIntegerSchema,
}).strict();

const databaseLatestFinalSchema = z.object({
  id: z.string().uuid(),
  closing_kind: z.literal("final"),
  version: positiveIntegerSchema,
  status: z.literal("closed"),
  period_month: periodMonthSchema,
  closed_at: timestampSchema,
  ...financialSummaryShape,
}).strict().superRefine(validateFinancialSummary);

const databasePageSchema = z.object({
  as_of: timestampSchema,
  period_month: periodMonthSchema,
  members: databaseMembersSchema,
  current_finance: z.discriminatedUnion("status", [
    databaseAvailableFinanceSchema,
    databaseBlockedFinanceSchema,
  ]),
  latest_final: databaseLatestFinalSchema.nullable(),
  trends: z.array(databaseTrendSchema).max(6),
}).strict().superRefine((value, context) => {
  let currentTrendCount = 0;

  for (let index = 0; index < value.trends.length; index += 1) {
    const trend = value.trends[index];
    const previous = value.trends[index - 1];

    if (trend.period_month < FIRST_LEDGER_MONTH) {
      context.addIssue({ code: "custom", message: "trend before ledger start" });
    }

    if (previous && previous.period_month >= trend.period_month) {
      context.addIssue({ code: "custom", message: "trend order" });
    }

    if (trend.period_month > value.period_month) {
      context.addIssue({ code: "custom", message: "future trend" });
    }

    if (trend.period_month < value.period_month && trend.source !== "final") {
      context.addIssue({ code: "custom", message: "past trends require final source" });
    }

    if (trend.source === "current") {
      currentTrendCount += 1;
      if (trend.period_month !== value.period_month) {
        context.addIssue({ code: "custom", message: "current trend period" });
      }
    }
  }

  if (currentTrendCount > 1) {
    context.addIssue({ code: "custom", message: "multiple current trends" });
  }
});

export type DashboardMemberSummary = {
  activeCount: number;
  upcomingCount: number;
  pausedCount: number;
  joinedThisMonthCount: number;
  pausedThisMonthCount: number;
  withdrawnThisMonthCount: number;
};

export type DashboardTrendPoint = {
  periodMonth: string;
  source: "final" | "current";
  actualFeeIncome: number;
  expenseTotal: number;
  closingLedgerBalance: number;
};

export type DashboardFinancialSummary = {
  billedTotal: number;
  actualFeeIncome: number;
  expenseTotal: number;
  attributedNet: number;
  fullyPaidCount: number;
  feeTargetCount: number;
  unpaidCount: number;
  unpaidTotal: number;
  openingLedgerBalance: number;
  closingLedgerBalance: number;
};

export type DashboardClosingReference = {
  id: string;
  closingKind: "interim" | "final";
  version: number;
  status: "closed";
};

type DashboardFinalClosingReference = DashboardClosingReference & {
  closingKind: "final";
};

type DashboardInterimClosingReference = DashboardClosingReference & {
  closingKind: "interim";
};

export type DashboardFinalClosingSummary = DashboardFinalClosingReference &
  DashboardFinancialSummary & {
    periodMonth: string;
    closedAt: string;
  };

export type DashboardCurrentFinance =
  | {
      status: "available";
      blockedReason: null;
      source: "final" | "current";
      summary: DashboardFinancialSummary;
      activeFinal: DashboardFinalClosingReference | null;
      latestInterim: DashboardInterimClosingReference | null;
    }
  | {
      status: "blocked";
      blockedReason:
        | "member-activity-start-required"
        | "prior-final-closing-required"
        | "invalid-public-expense-description";
      source: null;
      summary: null;
      activeFinal: null;
      latestInterim: DashboardInterimClosingReference | null;
    };

export type DashboardPageData = {
  asOf: string;
  periodMonth: string;
  members: DashboardMemberSummary;
  currentFinance: DashboardCurrentFinance;
  latestFinal: DashboardFinalClosingSummary | null;
  trends: DashboardTrendPoint[];
};

export function parseDashboardPage(value: unknown): DashboardPageData {
  const parsed = databasePageSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(PARSE_ERROR_MESSAGE);
  }

  return {
    asOf: parsed.data.as_of,
    periodMonth: parsed.data.period_month,
    members: mapMembers(parsed.data.members),
    currentFinance: mapCurrentFinance(parsed.data.current_finance),
    latestFinal: parsed.data.latest_final
      ? mapLatestFinal(parsed.data.latest_final)
      : null,
    trends: parsed.data.trends.map(mapTrend),
  };
}

function validateFinancialSummary(
  value: z.infer<typeof databaseFinancialSummarySchema>,
  context: z.RefinementCtx,
) {
  if (value.fully_paid_count + value.unpaid_count !== value.fee_target_count) {
    context.addIssue({ code: "custom", message: "fee payment counts" });
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
}

function mapMembers(
  value: z.infer<typeof databaseMembersSchema>,
): DashboardMemberSummary {
  return {
    activeCount: value.active_count,
    upcomingCount: value.upcoming_count,
    pausedCount: value.paused_count,
    joinedThisMonthCount: value.joined_this_month_count,
    pausedThisMonthCount: value.paused_this_month_count,
    withdrawnThisMonthCount: value.withdrawn_this_month_count,
  };
}

function mapCurrentFinance(
  value: z.infer<typeof databasePageSchema>["current_finance"],
): DashboardCurrentFinance {
  if (value.status === "blocked") {
    return {
      status: "blocked",
      blockedReason: value.blocked_reason,
      source: null,
      summary: null,
      activeFinal: null,
      latestInterim: value.latest_interim
        ? mapInterimClosingReference(value.latest_interim)
        : null,
    };
  }

  return {
    status: "available",
    blockedReason: null,
    source: value.source,
    summary: mapFinancialSummary(value.summary),
    activeFinal: value.active_final
      ? mapFinalClosingReference(value.active_final)
      : null,
    latestInterim: value.latest_interim
      ? mapInterimClosingReference(value.latest_interim)
      : null,
  };
}

function mapLatestFinal(
  value: z.infer<typeof databaseLatestFinalSchema>,
): DashboardFinalClosingSummary {
  return {
    ...mapFinalClosingReference(value),
    periodMonth: value.period_month,
    closedAt: value.closed_at,
    ...mapFinancialSummary(value),
  };
}

function mapClosingReference(
  value: z.infer<typeof databaseClosingReferenceSchema>,
): DashboardClosingReference {
  return {
    id: value.id,
    closingKind: value.closing_kind,
    version: value.version,
    status: value.status,
  };
}

function mapFinalClosingReference(
  value: z.infer<typeof databaseFinalReferenceSchema>,
): DashboardFinalClosingReference {
  return {
    ...mapClosingReference(value),
    closingKind: "final",
  };
}

function mapInterimClosingReference(
  value: z.infer<typeof databaseInterimReferenceSchema>,
): DashboardInterimClosingReference {
  return {
    ...mapClosingReference(value),
    closingKind: "interim",
  };
}

function mapFinancialSummary(
  value: z.infer<typeof databaseFinancialSummarySchema>,
): DashboardFinancialSummary {
  return {
    billedTotal: value.billed_total,
    actualFeeIncome: value.actual_fee_income,
    expenseTotal: value.expense_total,
    attributedNet: value.attributed_net,
    fullyPaidCount: value.fully_paid_count,
    feeTargetCount: value.fee_target_count,
    unpaidCount: value.unpaid_count,
    unpaidTotal: value.unpaid_total,
    openingLedgerBalance: value.opening_ledger_balance,
    closingLedgerBalance: value.closing_ledger_balance,
  };
}

function mapTrend(value: z.infer<typeof databaseTrendSchema>): DashboardTrendPoint {
  return {
    periodMonth: value.period_month,
    source: value.source,
    actualFeeIncome: value.actual_fee_income,
    expenseTotal: value.expense_total,
    closingLedgerBalance: value.closing_ledger_balance,
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
