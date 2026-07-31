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
const A4_WIDTH_POINTS = 595.28;
const PAGE_HORIZONTAL_PADDING_POINTS = 72;
const DESCRIPTION_COLUMN_END_POINTS =
  PAGE_HORIZONTAL_PADDING_POINTS +
  (A4_WIDTH_POINTS - PAGE_HORIZONTAL_PADDING_POINTS * 2) *
    (0.21 + 0.19 + 0.38);

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
  it("renders the public ledger report without private settlement details", async () => {
    const pdf = await renderMonthlyReportPdf(report);

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const darkPixelCounts = await getRenderedDarkPixelCounts(pdf);
    expect(darkPixelCounts.header).toBeGreaterThan(0);
    expect(darkPixelCounts.ledger).toBeGreaterThan(0);
    expect(darkPixelCounts.expenseDetails).toBeGreaterThan(0);
    expect(darkPixelCounts.footer).toBeGreaterThan(0);

    const text = await extractPdfText(pdf);
    expect(text).toContain("JW TENNIS CLUB");
    expect(text).toContain("월간 결산 보고서");
    expect(text).toContain("회원 현황 (7월 기준)");
    expect(text).toContain("수입");
    expect(text).toContain("수입 합계");
    expect(text).toContain("지출");
    expect(text).toContain("지출 합계");
    expect(text).toContain("지출 합계 (2건)");
    expect(text).toContain("잔액");
    expect(text).toContain("월말 잔액");
    expect(text).toContain("지출 상세");
    expect(text).not.toContain("최종 마감 v2 · 재개됨");
    expect(text).toContain("결산일");
    expect(text).toContain("2026.08.02 12:04:05");
    expect(text).toContain("결산 처리자");
    expect(text).toContain("PDF 생성일");
    expect(text).toContain("2026.08.03 21:00:00");
    expect(text).toContain("생성자");
    expect(text).toContain("회원 수");
    expect(text).not.toContain("활동 회원");
    expect(text).not.toContain("회비 부과 대상");
    expect(text).toContain("완납 회원");
    expect(text).toContain("미납 회원");
    expect(text).toContain("총 청구액");
    expect(text).toContain("실제 회비 수납액");
    expect(text).toContain("인정 납부액");
    expect(text).toContain("조정 수납액");
    expect(text).toContain("미납액");
    expect(text).toContain("지출 합계");
    expect(text).toContain("당월 수지");
    expect(text).toContain("전월 이월 잔액");
    expect(text).toContain("월말 잔액");
    expect(text).toContain("지출 상세");
    expect(text).toContain("회비는 귀속월 기준이며 지출은 사용일 기준입니다.");
    expect(text).toContain("개별 납부 내역");
    expect(text).not.toContain("문의사항");
    expect(text).not.toContain("010-");
    expect(text).not.toContain("정산");
  }, PDF_RENDER_TIMEOUT_MS);

  it("omits only the adjustment income card when its value is zero", async () => {
    const pdf = await renderMonthlyReportPdf({ ...report, adjustmentIncome: 0 });
    const text = await extractPdfText(pdf);

    expect(text).not.toContain("조정 수납액");
    expect(text).toContain("인정 납부액");
    expect(text).toContain("미납액");
    expect(text).toContain("지출 합계");
  }, PDF_RENDER_TIMEOUT_MS);

  it("continues long expense details onto a second page without omitting rows", async () => {
    const longDescription = [
      "행시작표식",
      ...Array.from({ length: 50 }, () => "페이지경계행분리방지검증"),
      "행종료표식",
    ].join(" ");
    const expenseRows = Array.from({ length: 45 }, (_, index) => ({
      expenseDate: `2026.07.${String((index % 28) + 1).padStart(2, "0")}`,
      categoryLabel: "코트",
      description: index === 33 ? longDescription : `장기 지출 내역 ${index + 1}`,
      amount: 10_000 + index,
    }));
    const pdf = await renderMonthlyReportPdf({ ...report, expenseRows });
    const text = await extractPdfText(pdf);
    const pageCount = await getPdfPageCount(pdf);
    const [longRowStartPage, longRowEndPage] = await getPdfTextPageNumbers(pdf, [
      "행시작표식",
      "행종료표식",
    ]);

    expect(pageCount).toBeGreaterThan(1);
    expect(text).toContain("장기 지출 내역 1");
    expect(text).toContain("장기 지출 내역 45");
    expect(longRowStartPage).toBe(longRowEndPage);
  }, PDF_RENDER_TIMEOUT_MS);

  it("wraps a UI-valid 120-character no-space Korean description inside its column", async () => {
    const finalMarker = "끝고유표식";
    const description = `${"가".repeat(115)}${finalMarker}`;
    const pdf = await renderMonthlyReportPdf({
      ...report,
      expenseRows: [
        {
          expenseDate: "2026.07.12",
          categoryLabel: "코트",
          description,
          amount: 9_876_543,
        },
      ],
    });
    const text = normalizeWrappedPdfText(await extractPdfText(pdf));
    const descriptionWords = getDescriptionWords(
      await getPdfWordBoundingBoxes(pdf),
      description,
    );
    const extractedDescription = descriptionWords
      .map((word) => word.text)
      .join("")
      .replace(/\s+/g, "");

    expect(description).toHaveLength(120);
    expect(text).toContain(finalMarker);
    expect([...text].filter((character) => character === "가")).toHaveLength(115);
    expect(extractedDescription).toBe(description);
    expect(extractedDescription).not.toContain("-");
    expect(descriptionWords.length).toBeGreaterThan(1);
    expect(Math.max(...descriptionWords.map((word) => word.xMax))).toBeLessThanOrEqual(
      DESCRIPTION_COLUMN_END_POINTS,
    );
  }, PDF_RENDER_TIMEOUT_MS);

  it("wraps the snapshot contract's 500-character no-space description boundary", async () => {
    const finalMarker = "경계고유표식";
    const description = `${"나".repeat(494)}${finalMarker}`;
    const pdf = await renderMonthlyReportPdf({
      ...report,
      expenseRows: [
        {
          expenseDate: "2026.07.12",
          categoryLabel: "코트",
          description,
          amount: 9_876_543,
        },
      ],
    });
    const text = normalizeWrappedPdfText(await extractPdfText(pdf));
    const descriptionWords = getDescriptionWords(
      await getPdfWordBoundingBoxes(pdf),
      description,
    );
    const extractedDescription = descriptionWords
      .map((word) => word.text)
      .join("")
      .replace(/\s+/g, "");
    const [rowStartPage, rowEndPage] = await getPdfTextPageNumbers(pdf, [
      "2026.07.12",
      finalMarker,
    ]);

    expect(description).toHaveLength(500);
    expect(text).toContain(finalMarker);
    expect([...text].filter((character) => character === "나")).toHaveLength(494);
    expect(extractedDescription).toBe(description);
    expect(extractedDescription).not.toContain("-");
    expect(descriptionWords.length).toBeGreaterThan(1);
    expect(Math.max(...descriptionWords.map((word) => word.xMax))).toBeLessThanOrEqual(
      DESCRIPTION_COLUMN_END_POINTS,
    );
    expect(rowStartPage).toBe(rowEndPage);
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

async function getPdfPageCount(pdf: Buffer) {
  const directory = await mkdtemp(path.join(tmpdir(), "jw-tennis-report-pages-"));
  const inputPath = path.join(directory, "report.pdf");

  try {
    await writeFile(inputPath, pdf);
    const { stdout } = await execFileAsync("pdfinfo", [inputPath]);
    const pagesLine = stdout.split("\n").find((line) => line.startsWith("Pages:"));
    const pageCount = Number(pagesLine?.replace("Pages:", "").trim());

    if (!Number.isInteger(pageCount) || pageCount < 1) {
      throw new Error(`pdfinfo did not return a valid page count: ${pagesLine ?? "missing Pages line"}`);
    }

    return pageCount;
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function getPdfTextPageNumbers(pdf: Buffer, textMarkers: string[]) {
  const directory = await mkdtemp(path.join(tmpdir(), "jw-tennis-report-bbox-"));
  const inputPath = path.join(directory, "report.pdf");
  const outputPath = path.join(directory, "report.html");

  try {
    await writeFile(inputPath, pdf);
    await execFileAsync("pdftotext", ["-bbox", inputPath, outputPath]);
    const boundingBoxHtml = await readFile(outputPath, "utf8");
    const pages = [...boundingBoxHtml.matchAll(/<page [^>]*>([\s\S]*?)<\/page>/g)].map(
      (match) =>
        [...match[1].matchAll(/<word [^>]*>([^<]*)<\/word>/g)]
          .map((wordMatch) => normalizeWrappedPdfText(wordMatch[1]))
          .join(""),
    );

    return textMarkers.map((marker) => {
      const pageIndex = pages.findIndex((page) => page.includes(marker));

      if (pageIndex === -1) {
        throw new Error(`Could not find PDF text marker: ${marker}`);
      }

      return pageIndex + 1;
    });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function getPdfWordBoundingBoxes(pdf: Buffer) {
  const directory = await mkdtemp(path.join(tmpdir(), "jw-tennis-report-words-"));
  const inputPath = path.join(directory, "report.pdf");
  const outputPath = path.join(directory, "report.html");

  try {
    await writeFile(inputPath, pdf);
    await execFileAsync("pdftotext", ["-bbox", inputPath, outputPath]);
    const boundingBoxHtml = await readFile(outputPath, "utf8");

    return [...boundingBoxHtml.matchAll(
      /<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)">([^<]*)<\/word>/g,
    )].map((match) => ({
      text: match[5],
      xMin: Number(match[1]),
      yMin: Number(match[2]),
      xMax: Number(match[3]),
      yMax: Number(match[4]),
    }));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function normalizeWrappedPdfText(text: string) {
  return text.replace(/\s+/g, "");
}

function getDescriptionWords(
  words: Awaited<ReturnType<typeof getPdfWordBoundingBoxes>>,
  description: string,
) {
  const descriptionCharacters = new Set([...description, "-"]);

  return words.filter((word) => {
    const normalizedWord = normalizeWrappedPdfText(word.text);

    return (
      normalizedWord.length > 0 &&
      [...normalizedWord].every((character) => descriptionCharacters.has(character))
    );
  });
}

async function getRenderedDarkPixelCounts(pdf: Buffer) {
  const { ppm, pixelStart, width } = await renderFirstPageToPpm(pdf);

  return {
    header: countDarkPixels(ppm, pixelStart, width, 50, 300),
    ledger: countDarkPixels(ppm, pixelStart, width, 250, 800),
    expenseDetails: countDarkPixels(ppm, pixelStart, width, 800, 1_250),
    footer: countDarkPixels(ppm, pixelStart, width, 1_200, 1_500),
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
