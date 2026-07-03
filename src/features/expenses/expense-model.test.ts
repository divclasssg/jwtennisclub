import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EXPENSE_CATEGORY_LABELS,
  formatExpenseCategory,
  isExpenseCategory,
} from "./expense-model";

const migrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/202607030005_add_expenses.sql"),
  "utf8",
);
const receiptMigrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202607030006_add_expense_receipts_r2.sql",
  ),
  "utf8",
);

describe("expense model", () => {
  it("defines expense category labels", () => {
    expect(EXPENSE_CATEGORY_LABELS).toMatchObject({
      court: "코트",
      balls: "공",
      meal: "식사",
      event: "행사",
      maintenance: "정비",
      other: "기타",
    });
    expect(isExpenseCategory("court")).toBe(true);
    expect(isExpenseCategory("bad")).toBe(false);
    expect(formatExpenseCategory("maintenance")).toBe("정비");
  });

  it("creates expenses with permission-based RLS", () => {
    expect(migrationSql).toContain("create table if not exists public.expenses");
    expect(migrationSql).toContain("public.has_permission('expenses.view')");
    expect(migrationSql).toContain("public.has_permission('expenses.create')");
    expect(migrationSql).toContain("public.has_permission('expenses.update')");
    expect(migrationSql).toContain("public.has_permission('expenses.delete')");
  });

  it("adds R2 receipt metadata columns", () => {
    expect(receiptMigrationSql).toContain("receipt_file_key text");
    expect(receiptMigrationSql).toContain("receipt_file_name text");
    expect(receiptMigrationSql).toContain("receipt_content_type text");
    expect(receiptMigrationSql).toContain("receipt_file_size integer");
    expect(receiptMigrationSql).toContain("expenses_receipt_file_key_idx");
  });
});
