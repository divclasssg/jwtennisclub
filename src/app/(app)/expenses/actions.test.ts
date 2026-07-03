import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const expensesTable = {
    delete: vi.fn(() => expensesTable),
    eq: vi.fn(() => expensesTable),
    insert: vi.fn(async () => ({ error: null })),
    maybeSingle: vi.fn(async () => ({
      data: {
        id: "expense-1",
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
    expensesTable,
    deleteReceiptFile: vi.fn(async () => undefined),
    uploadReceiptFile: vi.fn(async () => undefined),
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
        receipt_file_key: "expenses/operator-id/2026/07/receipt.jpg",
      },
      error: null,
    });
    mocks.expensesTable.select.mockClear();
    mocks.expensesTable.update.mockClear();
    mocks.deleteReceiptFile.mockClear();
    mocks.uploadReceiptFile.mockClear();
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
      "id, receipt_file_key",
    );
    expect(mocks.expensesTable.eq).toHaveBeenCalledWith("id", "expense-1");
    expect(mocks.expensesTable.delete).toHaveBeenCalled();
    expect(mocks.deleteReceiptFile).toHaveBeenCalledWith(
      "expenses/operator-id/2026/07/receipt.jpg",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/expenses");
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
