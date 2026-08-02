import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const expenseDeleteQuery = {
    eq: vi.fn(() => expenseDeleteQuery),
    maybeSingle: vi.fn(async () => ({
      data: { id: "expense-1" } as { id: string } | null,
      error: null,
    })),
    select: vi.fn(() => expenseDeleteQuery),
  };
  const expensesTable = {
    delete: vi.fn(() => expenseDeleteQuery),
    eq: vi.fn(() => expensesTable),
    insert: vi.fn(
      async (): Promise<{ error: unknown }> => ({ error: null }),
    ),
    maybeSingle: vi.fn(async () => ({
      data: {
        id: "expense-1",
        expense_date: "2026-07-03",
        receipt_file_key: "expenses/operator-id/2026/07/receipt.jpg",
      },
      error: null,
    })),
    select: vi.fn(() => expensesTable),
    update: vi.fn(() => expensesTable),
  };
  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "operator-id" } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table !== "expenses") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return expensesTable;
    }),
  };

  return {
    expenseDeleteQuery,
    expensesTable,
    deleteReceiptFile: vi.fn(async (key: string) => {
      void key;
    }),
    getMonthlySourceLockStatus: vi.fn(
      async (periodMonth: string) => {
        void periodMonth;
        return false;
      },
    ),
    isMonthlySourceLockError: vi.fn(
      (error: unknown) =>
        Boolean(
          error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "55000" &&
            "message" in error &&
            String(error.message).includes("monthly closing source is locked"),
        ),
    ),
    uploadReceiptFile: vi.fn(
      async (input: { contentType: string; file: File; key: string }) => {
        void input;
      },
    ),
    revalidatePath: vi.fn(),
    redirect: vi.fn((path: string) => {
      throw new Error(`redirect:${path}`);
    }),
    supabase,
  };
});

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mocks.supabase),
}));

vi.mock("@/lib/r2", () => ({
  deleteReceiptFile: mocks.deleteReceiptFile,
  uploadReceiptFile: mocks.uploadReceiptFile,
}));

vi.mock("@/features/settlements/monthly-source-lock", () => ({
  getMonthlySourceLockStatus: mocks.getMonthlySourceLockStatus,
  isMonthlySourceLockError: mocks.isMonthlySourceLockError,
}));

import { createExpense, deleteExpense, updateExpense } from "./actions";

describe("expense actions", () => {
  beforeEach(() => {
    mocks.redirect.mockClear();
    mocks.revalidatePath.mockClear();
    mocks.supabase.auth.getUser.mockClear();
    mocks.supabase.from.mockClear();
    mocks.expensesTable.delete.mockClear();
    mocks.expensesTable.eq.mockClear();
    mocks.expensesTable.insert.mockClear();
    mocks.expensesTable.insert.mockResolvedValue({ error: null });
    mocks.expensesTable.maybeSingle.mockClear();
    mocks.expensesTable.maybeSingle.mockResolvedValue({
      data: {
        id: "expense-1",
        expense_date: "2026-07-03",
        receipt_file_key: "expenses/operator-id/2026/07/receipt.jpg",
      },
      error: null,
    });
    mocks.expensesTable.select.mockClear();
    mocks.expensesTable.update.mockClear();
    mocks.expenseDeleteQuery.eq.mockClear();
    mocks.expenseDeleteQuery.select.mockClear();
    mocks.expenseDeleteQuery.maybeSingle.mockReset();
    mocks.expenseDeleteQuery.maybeSingle.mockResolvedValue({
      data: { id: "expense-1" },
      error: null,
    });
    mocks.deleteReceiptFile.mockReset();
    mocks.deleteReceiptFile.mockResolvedValue(undefined);
    mocks.uploadReceiptFile.mockClear();
    mocks.getMonthlySourceLockStatus.mockReset();
    mocks.getMonthlySourceLockStatus.mockResolvedValue(false);
    mocks.isMonthlySourceLockError.mockClear();
  });

  it("redirects a finalized expense month before uploading or inserting", async () => {
    mocks.getMonthlySourceLockStatus.mockResolvedValueOnce(true);
    const formData = buildExpenseFormData({ expenseDate: "2026-07-03" });
    formData.set(
      "receiptFile",
      new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
    );

    await expect(createExpense(formData)).rejects.toThrow(
      "redirect:/expenses/new?error=closing-locked&month=2026-07",
    );

    expect(mocks.getMonthlySourceLockStatus).toHaveBeenCalledWith("2026-07-01");
    expect(mocks.uploadReceiptFile).not.toHaveBeenCalled();
    expect(mocks.expensesTable.insert).not.toHaveBeenCalled();
  });

  it("cleans up a newly uploaded receipt when final closing wins the insert race", async () => {
    mocks.expensesTable.insert.mockResolvedValueOnce({
      error: {
        code: "55000",
        message: "monthly closing source is locked",
      },
    });
    const formData = buildExpenseFormData({ expenseDate: "2026-07-03" });
    formData.set(
      "receiptFile",
      new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
    );
    mocks.deleteReceiptFile
      .mockRejectedValueOnce(new Error("transient R2 failure"))
      .mockResolvedValueOnce(undefined);

    await expect(createExpense(formData)).rejects.toThrow(
      "redirect:/expenses/new?error=closing-locked&month=2026-07",
    );

    const uploadedKey = mocks.uploadReceiptFile.mock.calls[0][0].key;
    expect(mocks.deleteReceiptFile).toHaveBeenCalledWith(uploadedKey);
    expect(mocks.deleteReceiptFile).toHaveBeenCalledTimes(2);
    expect(mocks.isMonthlySourceLockError).toHaveBeenCalled();
  });

  it("fails observably after bounded receipt cleanup attempts are exhausted", async () => {
    mocks.expensesTable.insert.mockResolvedValueOnce({
      error: {
        code: "55000",
        message: "monthly closing source is locked",
      },
    });
    mocks.deleteReceiptFile.mockRejectedValue(
      new Error("persistent R2 failure"),
    );
    const formData = buildExpenseFormData({ expenseDate: "2026-07-03" });
    formData.set(
      "receiptFile",
      new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
    );

    await expect(createExpense(formData)).rejects.toThrow(
      "업로드된 영수증 파일을 정리하지 못했습니다.",
    );

    expect(mocks.deleteReceiptFile).toHaveBeenCalledTimes(3);
    expect(mocks.redirect).not.toHaveBeenCalledWith(
      "/expenses/new?error=closing-locked&month=2026-07",
    );
  });

  it("preflights both source and destination months before moving an expense", async () => {
    mocks.getMonthlySourceLockStatus.mockImplementation(
      async (periodMonth: string) => periodMonth === "2026-08-01",
    );
    const formData = buildExpenseFormData({
      id: "expense-1",
      expenseDate: "2026-08-04",
    });
    formData.set(
      "receiptFile",
      new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
    );

    await expect(updateExpense(formData)).rejects.toThrow(
      "redirect:/expenses/expense-1/edit?error=closing-locked&month=2026-08",
    );

    expect(mocks.getMonthlySourceLockStatus.mock.calls).toEqual([
      ["2026-07-01"],
      ["2026-08-01"],
    ]);
    expect(mocks.uploadReceiptFile).not.toHaveBeenCalled();
    expect(mocks.expensesTable.update).not.toHaveBeenCalled();
  });

  it("preserves the authoritative month when receipt removal is locked", async () => {
    mocks.getMonthlySourceLockStatus.mockResolvedValueOnce(true);
    const formData = new FormData();
    formData.set("id", "expense-1");
    formData.set("intent", "removeReceipt");

    await expect(updateExpense(formData)).rejects.toThrow(
      "redirect:/expenses/expense-1/edit?error=closing-locked&month=2026-07",
    );

    expect(mocks.expensesTable.update).not.toHaveBeenCalled();
    expect(mocks.deleteReceiptFile).not.toHaveBeenCalled();
  });

  it("redirects a finalized month before deleting its expense", async () => {
    mocks.getMonthlySourceLockStatus.mockResolvedValueOnce(true);
    const formData = new FormData();
    formData.set("expenseId", "expense-1");

    await expect(deleteExpense(formData)).rejects.toThrow(
      "redirect:/expenses?error=closing-locked&month=2026-07",
    );

    expect(mocks.expensesTable.delete).not.toHaveBeenCalled();
    expect(mocks.deleteReceiptFile).not.toHaveBeenCalled();
  });

  it("creates an expense and returns to the selected month", async () => {
    const formData = new FormData();
    formData.set("expenseDate", "2026-07-03");
    formData.set("category", "court");
    formData.set("description", "코트 대관");
    formData.set("amount", "120000");
    formData.set("memo", "야간 경기");

    await expect(createExpense(formData)).rejects.toThrow(
      "redirect:/expenses?status=created&month=2026-07",
    );

    expect(mocks.supabase.from).toHaveBeenCalledWith("expenses");
    expect(mocks.expensesTable.insert).toHaveBeenCalledWith({
      expense_date: "2026-07-03",
      category: "court",
      description: "코트 대관",
      amount: 120000,
      has_receipt: false,
      memo: "야간 경기",
      receipt_content_type: null,
      receipt_file_key: null,
      receipt_file_name: null,
      receipt_file_size: null,
      created_by: "operator-id",
      updated_by: "operator-id",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/expenses");
  });

  it("uploads a receipt file to R2 and stores its metadata", async () => {
    const formData = new FormData();
    const receiptFile = new File(["receipt"], "receipt.jpg", {
      type: "image/jpeg",
    });
    formData.set("expenseDate", "2026-07-03");
    formData.set("category", "court");
    formData.set("description", "코트 대관");
    formData.set("amount", "120000");
    formData.set("receiptFile", receiptFile);

    await expect(createExpense(formData)).rejects.toThrow(
      "redirect:/expenses?status=created&month=2026-07",
    );

    expect(mocks.uploadReceiptFile).toHaveBeenCalledWith({
      contentType: "image/jpeg",
      file: receiptFile,
      key: expect.stringMatching(
        /^expenses\/operator-id\/2026\/07\/\d+-[a-z0-9]+\.jpg$/,
      ),
    });
    expect(mocks.expensesTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        has_receipt: true,
        receipt_content_type: "image/jpeg",
        receipt_file_key: expect.stringMatching(
          /^expenses\/operator-id\/2026\/07\/\d+-[a-z0-9]+\.jpg$/,
        ),
        receipt_file_name: "receipt.jpg",
        receipt_file_size: receiptFile.size,
      }),
    );
  });

  it("deletes an expense and its receipt file", async () => {
    const formData = new FormData();
    formData.set("expenseId", "expense-1");

    await expect(deleteExpense(formData)).rejects.toThrow(
      "redirect:/expenses?status=deleted",
    );

    expect(mocks.expensesTable.select).toHaveBeenCalledWith(
      "id, expense_date, receipt_file_key",
    );
    expect(mocks.expensesTable.eq).toHaveBeenCalledWith("id", "expense-1");
    expect(mocks.expensesTable.delete).toHaveBeenCalled();
    expect(mocks.expenseDeleteQuery.eq).toHaveBeenCalledWith(
      "id",
      "expense-1",
    );
    expect(mocks.expenseDeleteQuery.select).toHaveBeenCalledWith("id");
    expect(mocks.deleteReceiptFile).toHaveBeenCalledWith(
      "expenses/operator-id/2026/07/receipt.jpg",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/expenses");
  });

  it("does not delete a receipt when the database reports no deleted row", async () => {
    mocks.expenseDeleteQuery.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    const formData = new FormData();
    formData.set("expenseId", "expense-1");

    await expect(deleteExpense(formData)).rejects.toThrow(
      "redirect:/expenses?error=delete-failed",
    );

    expect(mocks.deleteReceiptFile).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("updates an expense", async () => {
    const formData = new FormData();
    formData.set("id", "expense-1");
    formData.set("expenseDate", "2026-07-04");
    formData.set("category", "meal");
    formData.set("description", "식사");
    formData.set("amount", "50000");
    formData.set("memo", "수정");

    await expect(updateExpense(formData)).rejects.toThrow(
      "redirect:/expenses?status=updated&month=2026-07",
    );

    expect(mocks.expensesTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        expense_date: "2026-07-04",
        category: "meal",
        description: "식사",
        amount: 50000,
        memo: "수정",
        updated_by: "operator-id",
      }),
    );
    expect(mocks.expensesTable.eq).toHaveBeenCalledWith("id", "expense-1");
  });

  it("removes a receipt file while updating an expense", async () => {
    const formData = new FormData();
    formData.set("id", "expense-1");
    formData.set("intent", "removeReceipt");

    await expect(updateExpense(formData)).rejects.toThrow(
      "redirect:/expenses/expense-1/edit?status=receipt-deleted",
    );

    expect(mocks.expensesTable.update).toHaveBeenCalledWith(
      {
        has_receipt: false,
        receipt_content_type: null,
        receipt_file_key: null,
        receipt_file_name: null,
        receipt_file_size: null,
        updated_by: "operator-id",
      },
    );
    expect(mocks.deleteReceiptFile).toHaveBeenCalledWith(
      "expenses/operator-id/2026/07/receipt.jpg",
    );
  });

  it("replaces a receipt file while updating an expense", async () => {
    const formData = new FormData();
    const receiptFile = new File(["new-receipt"], "new-receipt.pdf", {
      type: "application/pdf",
    });
    formData.set("id", "expense-1");
    formData.set("expenseDate", "2026-07-04");
    formData.set("category", "meal");
    formData.set("description", "식사");
    formData.set("amount", "50000");
    formData.set("receiptFile", receiptFile);

    await expect(updateExpense(formData)).rejects.toThrow(
      "redirect:/expenses?status=updated&month=2026-07",
    );

    expect(mocks.uploadReceiptFile).toHaveBeenCalledWith({
      contentType: "application/pdf",
      file: receiptFile,
      key: expect.stringMatching(
        /^expenses\/operator-id\/2026\/07\/\d+-[a-z0-9]+\.pdf$/,
      ),
    });
    expect(mocks.expensesTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        has_receipt: true,
        receipt_content_type: "application/pdf",
        receipt_file_key: expect.stringMatching(
          /^expenses\/operator-id\/2026\/07\/\d+-[a-z0-9]+\.pdf$/,
        ),
        receipt_file_name: "new-receipt.pdf",
        receipt_file_size: receiptFile.size,
      }),
    );
    expect(mocks.deleteReceiptFile).toHaveBeenCalledWith(
      "expenses/operator-id/2026/07/receipt.jpg",
    );
  });
});

function buildExpenseFormData(input: {
  expenseDate: string;
  id?: string;
}) {
  const formData = new FormData();
  if (input.id) {
    formData.set("id", input.id);
  }
  formData.set("expenseDate", input.expenseDate);
  formData.set("category", "court");
  formData.set("description", "코트 대관");
  formData.set("amount", "120000");
  return formData;
}
