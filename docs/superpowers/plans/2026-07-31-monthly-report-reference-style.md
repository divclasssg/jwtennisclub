# Monthly Report Reference Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the card-based monthly closing PDF with an A4 ledger-style report inspired by `문서2.pdf`, while preserving every public snapshot field and the existing privacy boundary.

**Architecture:** Keep `MonthlyReportData`, the report route, audit RPC, snapshot lookup, and file naming unchanged. Rebuild only `MonthlyReportPdf.tsx` into reusable ledger rows and sections, then use a standalone preview script to render a representative July report into `output/pdf/` for Poppler inspection.

**Tech Stack:** TypeScript, React, `@react-pdf/renderer` 4.5.1, Vitest 4.1.9, Poppler (`pdfinfo`, `pdftotext`, `pdftoppm`), IBM Plex Sans KR.

## Global Constraints

- Use an A4 portrait page with a monochrome ledger layout, generous margins, right-aligned amounts, thin subtotal rules, and no card backgrounds.
- Preserve closing kind, version, status, closing timestamp/operator, PDF generation timestamp/operator, and every existing public settlement metric.
- Do not include personal phone numbers, unpaid member names, individual payment rows, receipt content, or internal notes.
- Keep `MonthlyReportData`, database objects, RPC calls, audit logging, route behavior, and filename rules unchanged.
- Target one page for a normal month; allow expense-heavy reports to continue onto additional pages without clipping or shrinking text.
- Do not deploy to production until the user approves the rendered preview.

---

### Task 1: Replace the card report with a ledger report

**Files:**
- Modify: `src/features/reports/MonthlyReportPdf.test.tsx`
- Modify: `src/features/reports/MonthlyReportPdf.tsx`

**Interfaces:**
- Consumes: `MonthlyReportData` from `src/features/reports/monthly-report.ts`
- Produces: unchanged `MonthlyReportPdf({ report })` and `renderMonthlyReportPdf(report): Promise<Buffer>`

- [ ] **Step 1: Write the failing ledger-content test**

In `MonthlyReportPdf.test.tsx`, replace the card-region pixel expectations with ledger-region expectations and add assertions for the new literal labels:

```ts
expect(text).toContain("JW TENNIS CLUB");
expect(text).toContain("월간 결산 보고서");
expect(text).toContain("회원 현황");
expect(text).toContain("수입");
expect(text).toContain("수입 합계");
expect(text).toContain("지출");
expect(text).toContain("지출 합계");
expect(text).toContain("잔액");
expect(text).toContain("기말 장부 잔액");
expect(text).toContain("지출 상세");
expect(text).toContain("최종 마감 v2 · 재개됨");
expect(text).not.toContain("문의사항");
expect(text).not.toContain("010-");
expect(text).not.toContain("정산");
```

Update the rendered pixel bands to cover `header`, `ledger`, `expenseDetails`, and `footer`, with each band requiring nonzero dark pixels.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run src/features/reports/MonthlyReportPdf.test.tsx
```

Expected: FAIL because the current PDF still renders summary cards and does not contain `수입 합계`, `지출 합계`, or `지출 상세`.

- [ ] **Step 3: Add ledger row components and monochrome styles**

In `MonthlyReportPdf.tsx`, replace `SummaryCard` with these focused components:

```tsx
function LedgerRow({
  label,
  value,
  total = false,
}: {
  label: string;
  value: string;
  total?: boolean;
}) {
  return (
    <View style={[styles.ledgerRow, total ? styles.totalRow : null]} wrap={false}>
      <Text style={total ? styles.totalLabel : styles.rowLabel}>{label}</Text>
      <Text style={total ? styles.totalValue : styles.rowValue}>{value}</Text>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}
```

Use 72pt horizontal margins, black text, 8.5-10pt body text, 12-14pt section/title text, and `0.5 solid #1d1d1f` total rules. Remove summary cards, gray fills, and outer table boxes.

- [ ] **Step 4: Build the header and member status block**

Render a two-column header:

```tsx
<View style={styles.header}>
  <View>
    <Text style={styles.clubName}>JW TENNIS CLUB</Text>
    <Text style={styles.reportTitle}>월간 결산 보고서</Text>
    <Text style={styles.period}>{report.periodLabel}</Text>
  </View>
  <View style={styles.metaColumn}>
    <Text>{report.closingLabel}</Text>
    <Text>결산일 {report.closedAtLabel}</Text>
    <Text>결산 처리자 {report.closedBy}</Text>
    <Text>PDF 생성일 {report.generatedAtLabel}</Text>
    <Text>생성자 {report.generatedBy}</Text>
  </View>
</View>
```

Render `회원 현황` with activity, fee target, fully paid, and unpaid member counts as four compact ledger rows.

- [ ] **Step 5: Build income, expense, and balance sections**

Render the financial rows without double-counting:

```tsx
<SectionTitle>수입</SectionTitle>
<LedgerRow label="총 청구액" value={`${formatCurrency(report.billedTotal)}원`} />
<LedgerRow label="실제 회비 수납액" value={`${formatCurrency(report.actualFeeIncome)}원`} />
<LedgerRow label="인정 납부액" value={`${formatCurrency(report.recognizedPaidTotal)}원`} />
{report.adjustmentIncome !== 0 ? (
  <LedgerRow label="조정 수납액" value={`${formatCurrency(report.adjustmentIncome)}원`} />
) : null}
<LedgerRow label={`미납액 (${report.unpaidCount}명)`} value={`${formatCurrency(report.unpaidTotal)}원`} />
<LedgerRow label="수입 합계" value={`${formatCurrency(report.actualFeeIncome)}원`} total />
```

For `지출`, render one row per category using category label and count, followed by `지출 합계`. For `잔액`, render opening balance, attributed net, and total closing balance, followed by `기초 장부 잔액 + 당월 귀속 수지 = 기말 장부 잔액`.

- [ ] **Step 6: Preserve expense details and privacy notices**

Render `지출 상세` as unboxed rows with a single header rule and columns for 사용일, 카테고리, 내용, 금액. Keep these two footer notices:

```text
회비는 귀속월 기준이며 지출은 사용일 기준입니다.
이 보고서는 회원 공유용으로 개별 납부 내역, 미납 회원명, 영수증 원본, 내부 메모를 포함하지 않습니다.
```

- [ ] **Step 7: Run the focused tests and verify GREEN**

Run:

```bash
npx vitest run src/features/reports/MonthlyReportPdf.test.tsx src/features/reports/monthly-report.test.ts
```

Expected: PASS with all Korean glyph, public-field, privacy, and ledger-label assertions satisfied.

- [ ] **Step 8: Commit the ledger layout**

```bash
git add src/features/reports/MonthlyReportPdf.tsx src/features/reports/MonthlyReportPdf.test.tsx
git commit -m "feat: redesign monthly report as ledger"
```

### Task 2: Protect expense-heavy reports from clipping

**Files:**
- Modify: `src/features/reports/MonthlyReportPdf.test.tsx`
- Modify: `src/features/reports/MonthlyReportPdf.tsx`

**Interfaces:**
- Consumes: unchanged `renderMonthlyReportPdf(report)`
- Produces: wrapped PDF pages where each expense row remains intact

- [ ] **Step 1: Write a failing multi-page regression test**

Create 45 literal expense rows in the test fixture and render the PDF:

```ts
const expenseRows = Array.from({ length: 45 }, (_, index) => ({
  expenseDate: `2026.07.${String((index % 28) + 1).padStart(2, "0")}`,
  categoryLabel: "코트",
  description: `장기 지출 내역 ${index + 1}`,
  amount: 10000 + index,
}));
const pdf = await renderMonthlyReportPdf({ ...report, expenseRows });
const text = await extractPdfText(pdf);
const pageCount = await getPdfPageCount(pdf);

expect(pageCount).toBeGreaterThan(1);
expect(text).toContain("장기 지출 내역 1");
expect(text).toContain("장기 지출 내역 45");
```

Implement `getPdfPageCount` by writing the buffer to a temporary file and running `pdfinfo`, then parsing the literal `Pages:` line.

- [ ] **Step 2: Run the multi-page test and verify RED**

Run:

```bash
npx vitest run src/features/reports/MonthlyReportPdf.test.tsx
```

Expected: FAIL if the long detail section is clipped, does not create a second page, or loses the final row.

- [ ] **Step 3: Make detail rows indivisible and allow page wrapping**

Keep the `Page` default wrapping enabled. Set `wrap={false}` on each expense detail row so a row moves intact to the next page. Mark the detail header with `fixed={false}` and keep the report footer after the final row.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npx vitest run src/features/reports/MonthlyReportPdf.test.tsx
```

Expected: PASS with more than one page and both the first and forty-fifth descriptions present.

- [ ] **Step 5: Commit multi-page safety**

```bash
git add src/features/reports/MonthlyReportPdf.tsx src/features/reports/MonthlyReportPdf.test.tsx
git commit -m "test: protect long monthly report details"
```

### Task 3: Generate and inspect the representative preview

**Files:**
- Create: `scripts/render-monthly-report-preview.tsx`
- Create artifact: `output/pdf/monthly-report-ledger-style-preview.pdf`
- Temporary renders: `tmp/pdfs/monthly-report-ledger-style-preview-*.png`

**Interfaces:**
- Consumes: `renderMonthlyReportPdf(report)` and a representative `MonthlyReportData` literal
- Produces: stable preview file `output/pdf/monthly-report-ledger-style-preview.pdf`

- [ ] **Step 1: Add a deterministic preview renderer**

Create `scripts/render-monthly-report-preview.tsx` with the current representative July values:

```tsx
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
  expenseRows: [{
    expenseDate: "2026.07.18",
    categoryLabel: "코트",
    description: "대관비",
    amount: 500000,
  }],
};

const outputDirectory = path.join(process.cwd(), "output/pdf");
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, "monthly-report-ledger-style-preview.pdf"),
  await renderMonthlyReportPdf(report),
);
```

- [ ] **Step 2: Generate the preview**

Run:

```bash
npx vite-node scripts/render-monthly-report-preview.tsx
```

Expected: `output/pdf/monthly-report-ledger-style-preview.pdf` exists and begins with `%PDF`.

- [ ] **Step 3: Inspect PDF structure and text**

Run:

```bash
pdfinfo output/pdf/monthly-report-ledger-style-preview.pdf
pdftotext -layout output/pdf/monthly-report-ledger-style-preview.pdf tmp/pdfs/monthly-report-ledger-style-preview.txt
pdffonts output/pdf/monthly-report-ledger-style-preview.pdf
```

Expected: A4 page size, one page for the representative report, embedded IBM Plex Sans KR subset, all ledger headings and totals present, and no phone number or private member data.

- [ ] **Step 4: Render and visually inspect**

Run:

```bash
mkdir -p tmp/pdfs
pdftoppm -png -r 150 output/pdf/monthly-report-ledger-style-preview.pdf tmp/pdfs/monthly-report-ledger-style-preview
```

Inspect the latest PNG at original resolution. Require no clipped text, overlapping rows, tofu glyphs, broken subtotal rules, excessive card styling, or private data.

- [ ] **Step 5: Iterate only on observed visual defects**

For each visual defect, add or adjust a focused assertion where practical, make the smallest style correction, regenerate the PDF, and re-render the PNG. Stop when the rendered page satisfies the design.

- [ ] **Step 6: Commit the preview renderer**

Do not commit the generated PDF or PNG unless the repository policy explicitly tracks generated artifacts.

```bash
git add scripts/render-monthly-report-preview.tsx
git commit -m "chore: add monthly report preview renderer"
```

### Task 4: Run the complete verification gate

**Files:**
- Modify: `docs/WORK_LOG.md`

**Interfaces:**
- Consumes: Tasks 1-3
- Produces: verified local preview ready for user review; no production deployment

- [ ] **Step 1: Run the full test suite**

```bash
npm run test -- --exclude '.worktrees/**'
```

Expected: all test files and tests pass with zero failures.

- [ ] **Step 2: Run static verification**

```bash
npx eslint . --ignore-pattern '.worktrees/**'
npx tsc --noEmit
git diff --check
```

Expected: all commands exit 0 with no output.

- [ ] **Step 3: Run the production build**

```bash
set -a
source /Users/seikpark/Desktop/projects/jwtennisclub/.env.local
npm run build
```

Expected: Next.js 16.2.10 compiles, TypeScript completes, and all 26 static pages finish generation.

- [ ] **Step 4: Record preview verification**

Append a concise entry to `docs/WORK_LOG.md` containing the focused/full test counts, lint/type/build result, PDF page size and count, embedded font result, and visual inspection result. State explicitly that production deployment and real report download were not performed.

- [ ] **Step 5: Commit verification notes**

```bash
git add docs/WORK_LOG.md
git commit -m "docs: record ledger PDF preview verification"
```

- [ ] **Step 6: Hand the preview to the user**

Provide exactly one output citation for `output/pdf/monthly-report-ledger-style-preview.pdf`, summarize the layout, and ask for visual approval before any production push.
