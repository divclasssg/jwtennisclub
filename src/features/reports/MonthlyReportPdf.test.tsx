import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { renderMonthlyReportPdf } from "./MonthlyReportPdf";

const PDF_RENDER_TIMEOUT_MS = 15_000;
const execFileAsync = promisify(execFile);
const KOREAN_GLYPH_PROBE = ["가", "나", "다", "라", "마", "바", "사", "아"];

const report = {
  title: "2026년 7월 테니스 클럽 월간 결산 보고서",
  periodLabel: "2026.07",
  closingKind: "final" as const,
  closingStatus: "reopened" as const,
  closingLabel: "최종 마감 v2 · 재개됨",
  closingVersion: 2,
  closedAtLabel: "2026.08.02 12:04:05",
  closedBy: "김마감",
  generatedAtLabel: "2026.08.03 21:00:00",
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
    const darkPixelCounts = await getRenderedDarkPixelCounts(pdf);
    expect(darkPixelCounts.titleAndMeta).toBeGreaterThan(500);
    expect(darkPixelCounts.memberCards).toBeGreaterThan(300);
    expect(darkPixelCounts.feeCards).toBeGreaterThan(1000);
    expect(darkPixelCounts.tables).toBeGreaterThan(1000);
    expect(darkPixelCounts.notices).toBeGreaterThan(500);

    const text = await extractPdfText(pdf);
    expect(text).toContain("결산 구분");
    expect(text).toContain("최종 마감 v2 · 재개됨");
    expect(text).toContain("결산일");
    expect(text).toContain("2026.08.02 12:04:05");
    expect(text).toContain("결산 처리자");
    expect(text).toContain("PDF 생성일");
    expect(text).toContain("2026.08.03 21:00:00");
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
    expect(text).not.toContain("정산");
  }, PDF_RENDER_TIMEOUT_MS);

  it("omits only the adjustment income card when its value is zero", async () => {
    const pdf = await renderMonthlyReportPdf({ ...report, adjustmentIncome: 0 });
    const text = await extractPdfText(pdf);

    expect(text).not.toContain("조정 수납액");
    expect(text).toContain("인정 납부액");
    expect(text).toContain("미납액");
    expect(text).toContain("운영 지출");
  }, PDF_RENDER_TIMEOUT_MS);

  it("renders distinct Korean glyph shapes instead of repeated tofu boxes", async () => {
    const pdf = await renderToBuffer(
      <Document>
        <Page size="A4" style={{ fontFamily: "IBM Plex Sans KR", fontWeight: 400 }}>
          {KOREAN_GLYPH_PROBE.map((glyph, index) => (
            <Text
              key={glyph}
              style={{
                color: "#1d1d1f",
                fontSize: 40,
                left: 30 + index * 65,
                position: "absolute",
                top: 40,
              }}
            >
              {glyph}
            </Text>
          ))}
        </Page>
      </Document>,
    );

    const signatures = await getKoreanGlyphShapeSignatures(pdf);
    expect(new Set(signatures).size).toBeGreaterThan(3);
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

async function getRenderedDarkPixelCounts(pdf: Buffer) {
  const { ppm, pixelStart, width } = await renderFirstPageToPpm(pdf);

  return {
    titleAndMeta: countDarkPixels(ppm, pixelStart, width, 50, 180),
    memberCards: countDarkPixels(ppm, pixelStart, width, 180, 320),
    feeCards: countDarkPixels(ppm, pixelStart, width, 320, 620),
    tables: countDarkPixels(ppm, pixelStart, width, 620, 1200),
    notices: countDarkPixels(ppm, pixelStart, width, 1200, 1500),
  };
}

async function getKoreanGlyphShapeSignatures(pdf: Buffer) {
  const { ppm, pixelStart, width } = await renderFirstPageToPpm(pdf);

  return KOREAN_GLYPH_PROBE.map((_, index) => {
    const left = Math.round((30 + index * 65) * (150 / 72));
    return getDarkPixelShapeSignature(ppm, pixelStart, width, left, left + 110, 60, 200);
  });
}

async function renderFirstPageToPpm(pdf: Buffer) {
  const directory = await mkdtemp(path.join(tmpdir(), "jw-tennis-report-render-"));
  const inputPath = path.join(directory, "report.pdf");
  const outputPath = path.join(directory, "report");

  try {
    await writeFile(inputPath, pdf);
    await execFileAsync("pdftoppm", [
      "-f",
      "1",
      "-l",
      "1",
      "-r",
      "150",
      inputPath,
      outputPath,
    ]);
    const ppm = await readFile(`${outputPath}-1.ppm`);
    const headerEnd = ppm.indexOf(Buffer.from("\n255\n"));
    const [width] = ppm
      .subarray(0, headerEnd)
      .toString("ascii")
      .split("\n")[1]
      .split(" ")
      .map(Number);
    const pixelStart = headerEnd + 5;

    return { ppm, pixelStart, width };
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function getDarkPixelShapeSignature(
  ppm: Buffer,
  pixelStart: number,
  width: number,
  left: number,
  right: number,
  top: number,
  bottom: number,
) {
  const pixels: string[] = [];

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const index = pixelStart + (y * width + x) * 3;
      if (ppm[index] < 100 && ppm[index + 1] < 100 && ppm[index + 2] < 100) {
        pixels.push(`${x - left}:${y - top}`);
      }
    }
  }

  return pixels.join(",");
}

function countDarkPixels(
  ppm: Buffer,
  pixelStart: number,
  width: number,
  top: number,
  bottom: number,
) {
  let count = 0;

  for (let y = top; y < bottom; y += 1) {
    for (let x = 50; x < width - 50; x += 1) {
      const index = pixelStart + (y * width + x) * 3;
      if (ppm[index] < 100 && ppm[index + 1] < 100 && ppm[index + 2] < 100) {
        count += 1;
      }
    }
  }

  return count;
}
