import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNextPeriodMonth, isExpenseCategory } from "@/features/expenses/expense-model";
import {
  buildMonthlyReportData,
  formatReportFileName,
  normalizeReportFilters,
  type MonthlyReportExpenseInput,
  type MonthlyReportFeePaymentInput,
} from "@/features/reports/monthly-report";
import { renderMonthlyReportPdf } from "@/features/reports/MonthlyReportPdf";

type FeePaymentDatabaseRow = {
  amount: number;
};

type ExpenseDatabaseRow = {
  amount: number;
  category: string;
  description: string;
  expense_date: string;
  memo: string | null;
};

type ProfileDatabaseRow = {
  display_name: string | null;
};

async function getReportFeePayments(
  periodMonth: string,
): Promise<MonthlyReportFeePaymentInput[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fee_payments")
    .select("id, amount")
    .eq("period_month", periodMonth)
    .order("amount", { ascending: false });

  if (error) {
    throw new Error("보고서 회비 수입을 불러오지 못했습니다.");
  }

  return ((data ?? []) as FeePaymentDatabaseRow[]).map((payment) => ({
    amount: payment.amount,
  }));
}

async function getReportExpenses(
  periodMonth: string,
): Promise<MonthlyReportExpenseInput[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .select("id, category, description, amount, expense_date, memo")
    .gte("expense_date", periodMonth)
    .lt("expense_date", getNextPeriodMonth(periodMonth))
    .order("amount", { ascending: false });

  if (error) {
    throw new Error("보고서 지출을 불러오지 못했습니다.");
  }

  return ((data ?? []) as ExpenseDatabaseRow[]).map((expense) => ({
    amount: expense.amount,
    category: isExpenseCategory(expense.category) ? expense.category : "other",
    description: expense.description,
    expenseDate: expense.expense_date,
    memo: expense.memo,
  }));
}

async function getGeneratedBy(user: { id: string; email?: string | null }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const profile = data as ProfileDatabaseRow | null;

  return profile?.display_name ?? user.email ?? "JW Tennis Club";
}

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const filters = normalizeReportFilters(params);
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const [feePayments, expenses, generatedBy] = await Promise.all([
    getReportFeePayments(filters.periodMonth),
    getReportExpenses(filters.periodMonth),
    getGeneratedBy(user),
  ]);
  const report = buildMonthlyReportData({
    periodMonth: filters.periodMonth,
    generatedAt: new Date(),
    generatedBy,
    feePayments,
    expenses,
  });
  const pdf = await renderMonthlyReportPdf(report);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Disposition": `attachment; filename="${formatReportFileName(filters.periodMonth)}"`,
      "Content-Type": "application/pdf",
    },
  });
}
