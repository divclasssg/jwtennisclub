"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  parseExpenseFormData,
  toExpenseDatabaseInput,
  validateExpenseForm,
} from "@/features/expenses/expense-form";
import {
  buildReceiptObjectKey,
  getReceiptFileValidationError,
  readReceiptFile,
} from "@/features/expenses/receipt-file";
import { deleteReceiptFile, uploadReceiptFile } from "@/lib/r2";
import { createClient } from "@/lib/supabase/server";
import {
  getMonthlySourceLockStatus,
  isMonthlySourceLockError,
} from "@/features/settlements/monthly-source-lock";

const expensesPath = "/expenses";
const expenseCreatePath = "/expenses/new";

function buildRedirect(path: string, params: Record<string, string | number>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value));
  }

  return `${path}?${searchParams.toString()}`;
}

function firstValidationCode(errors: string[]) {
  if (errors.some((error) => error.includes("사용일"))) {
    return "invalid-expense-date";
  }

  if (errors.some((error) => error.includes("카테고리"))) {
    return "invalid-category";
  }

  if (errors.some((error) => error.includes("내용"))) {
    return "invalid-description";
  }

  if (errors.some((error) => error.includes("금액"))) {
    return "invalid-amount";
  }

  return "invalid-expense";
}

function getExpensePeriodMonth(expenseDate: string) {
  return `${expenseDate.slice(0, 7)}-01`;
}

async function deleteNewReceiptAfterFailedWrite(receiptFileKey: string | null) {
  if (!receiptFileKey) {
    return;
  }

  try {
    await deleteReceiptFile(receiptFileKey);
  } catch {
    // The database does not reference this object. Leave cleanup for ops.
  }
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

export async function createExpense(formData: FormData) {
  const expense = parseExpenseFormData(formData);
  const receiptFile = readReceiptFile(formData);
  const errors = validateExpenseForm(expense);

  if (errors.length > 0) {
    redirect(
      buildRedirect(expenseCreatePath, { error: firstValidationCode(errors) }),
    );
  }

  if (receiptFile) {
    const receiptError = getReceiptFileValidationError(receiptFile);

    if (receiptError) {
      redirect(buildRedirect(expenseCreatePath, { error: receiptError }));
    }
  }

  const { supabase, userId } = await getAuthenticatedUserId();

  if (
    await getMonthlySourceLockStatus(
      getExpensePeriodMonth(expense.expenseDate),
    )
  ) {
    redirect(buildRedirect(expenseCreatePath, { error: "closing-locked" }));
  }

  const receiptFileKey = receiptFile
    ? buildReceiptObjectKey({
        expenseDate: expense.expenseDate,
        fileName: receiptFile.name,
        userId,
      })
    : null;

  if (receiptFile && receiptFileKey) {
    try {
      await uploadReceiptFile({
        contentType: receiptFile.type,
        file: receiptFile,
        key: receiptFileKey,
      });
    } catch {
      redirect(buildRedirect(expenseCreatePath, { error: "receipt-upload-failed" }));
    }
  }

  const { error } = await supabase.from("expenses").insert({
    ...toExpenseDatabaseInput(expense),
    has_receipt: expense.hasReceipt || Boolean(receiptFileKey),
    receipt_content_type: receiptFile?.type ?? null,
    receipt_file_key: receiptFileKey,
    receipt_file_name: receiptFile?.name ?? null,
    receipt_file_size: receiptFile?.size ?? null,
    created_by: userId,
    updated_by: userId,
  });

  if (error) {
    await deleteNewReceiptAfterFailedWrite(receiptFileKey);

    if (isMonthlySourceLockError(error)) {
      redirect(buildRedirect(expenseCreatePath, { error: "closing-locked" }));
    }

    redirect(buildRedirect(expenseCreatePath, { error: "save-failed" }));
  }

  revalidatePath(expensesPath);
  redirect(
    buildRedirect(expensesPath, {
      status: "created",
      month: expense.expenseDate.slice(0, 7),
    }),
  );
}

export async function updateExpense(formData: FormData) {
  const expenseId = String(formData.get("id") ?? "");
  const intent = formData.get("intent");
  const expense = parseExpenseFormData(formData);
  const receiptFile = readReceiptFile(formData);
  const shouldRemoveReceipt = intent === "removeReceipt";
  const errors = validateExpenseForm(expense);
  const editPath = `${expensesPath}/${expenseId}/edit`;

  if (!expenseId) {
    redirect(buildRedirect(expensesPath, { error: "missing-expense" }));
  }

  if (shouldRemoveReceipt) {
    const { supabase, userId } = await getAuthenticatedUserId();
    const { data: currentExpense, error: readError } = await supabase
      .from("expenses")
      .select("id, expense_date, receipt_file_key")
      .eq("id", expenseId)
      .maybeSingle();

    if (readError || !currentExpense) {
      redirect(buildRedirect(editPath, { error: "save-failed" }));
    }

    if (
      await getMonthlySourceLockStatus(
        getExpensePeriodMonth(currentExpense.expense_date),
      )
    ) {
      redirect(buildRedirect(editPath, { error: "closing-locked" }));
    }

    const { error } = await supabase
      .from("expenses")
      .update({
        has_receipt: false,
        receipt_content_type: null,
        receipt_file_key: null,
        receipt_file_name: null,
        receipt_file_size: null,
        updated_by: userId,
      })
      .eq("id", expenseId);

    if (error) {
      if (isMonthlySourceLockError(error)) {
        redirect(buildRedirect(editPath, { error: "closing-locked" }));
      }

      redirect(buildRedirect(editPath, { error: "save-failed" }));
    }

    if (currentExpense.receipt_file_key) {
      try {
        await deleteReceiptFile(currentExpense.receipt_file_key);
      } catch {
        // The expense no longer points at this receipt. Leave cleanup for ops.
      }
    }

    revalidatePath(expensesPath);
    revalidatePath(editPath);
    redirect(buildRedirect(editPath, { status: "receipt-deleted" }));
  }

  if (errors.length > 0) {
    redirect(buildRedirect(editPath, { error: firstValidationCode(errors) }));
  }

  if (receiptFile) {
    const receiptError = getReceiptFileValidationError(receiptFile);

    if (receiptError) {
      redirect(buildRedirect(editPath, { error: receiptError }));
    }
  }

  const { supabase, userId } = await getAuthenticatedUserId();
  const { data: currentExpense, error: readError } = await supabase
    .from("expenses")
    .select("id, expense_date, receipt_file_key")
    .eq("id", expenseId)
    .maybeSingle();

  if (readError || !currentExpense) {
    redirect(buildRedirect(editPath, { error: "save-failed" }));
  }

  const sourcePeriodMonth = getExpensePeriodMonth(currentExpense.expense_date);
  const destinationPeriodMonth = getExpensePeriodMonth(expense.expenseDate);
  const periodMonths = sourcePeriodMonth === destinationPeriodMonth
    ? [sourcePeriodMonth]
    : [sourcePeriodMonth, destinationPeriodMonth];
  const lockStatuses = await Promise.all(
    periodMonths.map((periodMonth) =>
      getMonthlySourceLockStatus(periodMonth),
    ),
  );

  if (lockStatuses.some(Boolean)) {
    redirect(buildRedirect(editPath, { error: "closing-locked" }));
  }

  const receiptFileKey = receiptFile
    ? buildReceiptObjectKey({
        expenseDate: expense.expenseDate,
        fileName: receiptFile.name,
        userId,
      })
    : null;

  if (receiptFile && receiptFileKey) {
    try {
      await uploadReceiptFile({
        contentType: receiptFile.type,
        file: receiptFile,
        key: receiptFileKey,
      });
    } catch {
      redirect(buildRedirect(editPath, { error: "receipt-upload-failed" }));
    }
  }

  const receiptUpdate = receiptFileKey
    ? {
        has_receipt: true,
        receipt_content_type: receiptFile?.type ?? null,
        receipt_file_key: receiptFileKey,
        receipt_file_name: receiptFile?.name ?? null,
        receipt_file_size: receiptFile?.size ?? null,
      }
    : {};

  const { error } = await supabase
    .from("expenses")
    .update({
      ...toExpenseDatabaseInput(expense),
      has_receipt:
        expense.hasReceipt ||
        Boolean(currentExpense.receipt_file_key) ||
        Boolean(receiptFileKey),
      ...receiptUpdate,
      updated_by: userId,
    })
    .eq("id", expenseId);

  if (error) {
    await deleteNewReceiptAfterFailedWrite(receiptFileKey);

    if (isMonthlySourceLockError(error)) {
      redirect(buildRedirect(editPath, { error: "closing-locked" }));
    }

    redirect(buildRedirect(editPath, { error: "save-failed" }));
  }

  if (receiptFileKey && currentExpense.receipt_file_key) {
    try {
      await deleteReceiptFile(currentExpense.receipt_file_key);
    } catch {
      // The expense now points at the new receipt. Leave orphan cleanup for ops.
    }
  }

  revalidatePath(expensesPath);
  revalidatePath(editPath);
  redirect(
    buildRedirect(expensesPath, {
      status: "updated",
      month: expense.expenseDate.slice(0, 7),
    }),
  );
}

export async function deleteExpense(formData: FormData) {
  const expenseId = formData.get("expenseId");

  if (typeof expenseId !== "string" || !expenseId) {
    redirect(buildRedirect(expensesPath, { error: "invalid-expense" }));
  }

  const { supabase } = await getAuthenticatedUserId();
  const { data: expense, error: readError } = await supabase
    .from("expenses")
    .select("id, expense_date, receipt_file_key")
    .eq("id", expenseId)
    .maybeSingle();

  if (readError || !expense) {
    redirect(buildRedirect(expensesPath, { error: "delete-failed" }));
  }

  const periodMonth = getExpensePeriodMonth(expense.expense_date);

  if (await getMonthlySourceLockStatus(periodMonth)) {
    redirect(
      buildRedirect(expensesPath, {
        error: "closing-locked",
        month: periodMonth.slice(0, 7),
      }),
    );
  }

  const { error: deleteError } = await supabase
    .from("expenses")
    .delete()
    .eq("id", expenseId);

  if (deleteError) {
    if (isMonthlySourceLockError(deleteError)) {
      redirect(
        buildRedirect(expensesPath, {
          error: "closing-locked",
          month: periodMonth.slice(0, 7),
        }),
      );
    }

    redirect(buildRedirect(expensesPath, { error: "delete-failed" }));
  }

  if (expense.receipt_file_key) {
    try {
      await deleteReceiptFile(expense.receipt_file_key);
    } catch {
      // The database row is already deleted. Leave orphan cleanup for ops.
    }
  }

  revalidatePath(expensesPath);
  redirect(buildRedirect(expensesPath, { status: "deleted" }));
}
