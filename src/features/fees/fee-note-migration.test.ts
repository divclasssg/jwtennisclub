import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const path = join(
  process.cwd(),
  "supabase/migrations/202607150001_add_fee_monthly_notes.sql",
);
const sql = existsSync(path) ? readFileSync(path, "utf8").toLowerCase() : "";

describe("fee monthly notes migration", () => {
  it("creates one bounded note per member and month", () => {
    expect(sql).toContain("create table public.fee_monthly_notes");
    expect(sql).toContain("unique (member_id, period_month)");
    expect(sql).toContain("length(memo) between 1 and 500");
  });

  it("protects notes with existing fee permissions", () => {
    expect(sql).toContain(
      "alter table public.fee_monthly_notes enable row level security",
    );
    expect(sql).toContain("public.has_permission('fees.payments.view')");
    expect(sql).toContain("public.has_permission('fees.payments.create')");
    expect(sql).toContain("public.has_permission('fees.payments.update')");
  });

  it("backfills and atomically syncs CSV payment memos", () => {
    expect(sql).toContain("from public.fee_payments");
    expect(sql).toContain(
      "on conflict (member_id, period_month) do nothing",
    );
    expect(sql).toContain(
      "create or replace function public.sync_fee_payment_memo_to_monthly_note()",
    );
    expect(sql).toContain(
      "after insert or update of memo on public.fee_payments",
    );
    expect(sql).toContain("fee payment memo exceeds 500 characters");
  });
});
