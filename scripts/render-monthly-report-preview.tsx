import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderMonthlyReportPdf } from "../src/features/reports/MonthlyReportPdf";

const report = {
  title: "2026년 7월 테니스 클럽 월간 결산 보고서",
  periodLabel: "2026.07",
  closingKind: "final" as const,
  closingStatus: "reopened" as const,
  closingLabel: "최종 마감 v2 · 재개됨",
  closingVersion: 2,
  closedAtLabel: "2026.07.31 14:41:41",
  closedBy: "박세익",
  generatedAtLabel: "2026.07.31 15:00:00",
  generatedBy: "박세익",
  activityMemberCount: 19,
  feeTargetCount: 18,
  fullyPaidCount: 18,
  unpaidCount: 0,
  billedTotal: 540000,
  actualFeeIncome: 540000,
  recognizedPaidTotal: 540000,
  adjustmentIncome: 0,
  unpaidTotal: 0,
  expenseTotal: 500000,
  expenseCount: 1,
  attributedNet: 40000,
  openingLedgerBalance: 0,
  closingLedgerBalance: 40000,
  expenseCategoryRows: [{ category: "court" as const, count: 1, amount: 500000 }],
  expenseRows: [
    {
      expenseDate: "2026.07.18",
      categoryLabel: "코트",
      description: "대관비",
      amount: 500000,
    },
  ],
};

async function renderPreview() {
  const outputDirectory = path.join(process.cwd(), "output/pdf");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, "monthly-report-ledger-style-preview.pdf"),
    await renderMonthlyReportPdf(report),
  );
}

void renderPreview().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
