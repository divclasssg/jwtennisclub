import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { renderMonthlyReportPdf } from "./MonthlyReportPdf";

const PDF_RENDER_TIMEOUT_MS = 15_000;
const execFileAsync = promisify(execFile);

const report = {
  title: "2026년 7월 테니스 클럽 월간 정산 보고서",
  periodLabel: "2026.07",
  closingVersion: 2,
  closedAtLabel: "2026.08.02",
  closedBy: "김마감",
  generatedAtLabel: "2026.08.03",
  generatedBy: "김생성",
  activityMemberCount: 21,
  feeTargetCount: 20,
  fullyPaidCount: 17,
  unpaidCount: 3,
  billedTotal: 600000,
  actualFeeIncome: 525000,
  recognizedPaidTotal: 510000,
  adjustmentIncome: 15000,
  unpaidTotal: 90000,
  expenseTotal: 130000,
  expenseCount: 2,
  attributedNet: 395000,
  openingLedgerBalance: 0,
  closingLedgerBalance: 395000,
  expenseCategoryRows: [{ category: "court" as const, amount: 130000, count: 1 }],
  expenseRows: [
    {
      expenseDate: "2026.07.12",
      categoryLabel: "코트",
      description: "코트 대관",
      amount: 130000,
    },
  ],
};

describe("renderMonthlyReportPdf", () => {
  it("renders every public snapshot label and renamed expense section", async () => {
    const pdf = await renderMonthlyReportPdf(report);

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");

    const text = await extractPdfText(pdf);
    expect(text).toContain("마감 버전");
    expect(text).toContain("마감일");
    expect(text).toContain("마감 처리자");
    expect(text).toContain("PDF 생성일");
    expect(text).toContain("생성자");
    expect(text).toContain("월말 활동 회원");
    expect(text).toContain("회비 부과 대상");
    expect(text).toContain("완납 회원");
    expect(text).toContain("미납 회원");
    expect(text).toContain("총 청구액");
    expect(text).toContain("실제 회비 수납액");
    expect(text).toContain("인정 납부액");
    expect(text).toContain("조정 수납액");
    expect(text).toContain("미납액");
    expect(text).toContain("운영 지출");
    expect(text).toContain("당월 귀속 수지");
    expect(text).toContain("기초 장부 잔액");
    expect(text).toContain("기말 장부 잔액");
    expect(text).toContain("카테고리별 지출");
    expect(text).toContain("지출 내역");
    expect(text).not.toContain("주요 지출 내역");
    expect(text).toContain("회비는 귀속월 기준이며 지출은 사용일 기준입니다.");
    expect(text).toContain("개별 납부 내역");
  }, PDF_RENDER_TIMEOUT_MS);

  it("omits only the adjustment income card when its value is zero", async () => {
    const pdf = await renderMonthlyReportPdf({ ...report, adjustmentIncome: 0 });
    const text = await extractPdfText(pdf);

    expect(text).not.toContain("조정 수납액");
    expect(text).toContain("인정 납부액");
    expect(text).toContain("미납액");
    expect(text).toContain("운영 지출");
  }, PDF_RENDER_TIMEOUT_MS);
});

async function extractPdfText(pdf: Buffer) {
  const directory = await mkdtemp(path.join(tmpdir(), "jw-tennis-report-test-"));
  const inputPath = path.join(directory, "report.pdf");
  const outputPath = path.join(directory, "report.txt");

  try {
    await writeFile(inputPath, pdf);
    await execFileAsync("pdftotext", ["-layout", inputPath, outputPath]);
    return readFile(outputPath, "utf8");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
