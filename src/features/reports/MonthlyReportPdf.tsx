import path from "node:path";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import {
  formatCurrency,
  type MonthlyReportData,
} from "./monthly-report";
import { formatSettlementBalance } from "@/features/settlements/settlement-summary";
import { formatExpenseCategory } from "@/features/expenses/expense-model";

const ibmPlexSansKrFontPath = path.join(
  process.cwd(),
  "src/features/reports/fonts/IBMPlexSansKR-Regular.ttf",
);

Font.register({
  family: "IBM Plex Sans KR",
  fontStyle: "normal",
  fontWeight: 400,
  src: ibmPlexSansKrFontPath,
});

const koreanGraphemeSegmenter = new Intl.Segmenter("ko", {
  granularity: "grapheme",
});
// Textkit renders hyphenation penalties with a visible "-". Its trim-empty
// syllables become zero-width glue breaks instead, so source text stays visible
// without added glyphs.
const INVISIBLE_BREAK_OPPORTUNITY = "\uFEFF";

function addInvisibleGraphemeBreaks(word: string) {
  const graphemes = Array.from(
    koreanGraphemeSegmenter.segment(word),
    ({ segment }) => segment,
  );

  return graphemes.flatMap((grapheme, index) =>
    index === graphemes.length - 1
      ? [grapheme]
      : [grapheme, INVISIBLE_BREAK_OPPORTUNITY],
  );
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 72,
    paddingVertical: 54,
    color: "#000000",
    fontFamily: "IBM Plex Sans KR",
    fontSize: 9,
    fontWeight: 400,
    lineHeight: 1.4,
  },
  header: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  clubName: {
    fontSize: 14,
  },
  reportTitle: {
    fontSize: 13,
    marginTop: 2,
  },
  period: {
    fontSize: 10,
    marginTop: 4,
  },
  metaColumn: {
    display: "flex",
    alignItems: "flex-end",
    fontSize: 8.5,
    lineHeight: 1.4,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    marginBottom: 4,
    fontSize: 12,
  },
  ledgerRow: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  rowLabel: {
    fontSize: 9,
  },
  rowValue: {
    fontSize: 9,
    textAlign: "right",
  },
  totalRow: {
    borderBottom: "0.5 solid #1d1d1f",
    borderTop: "0.5 solid #1d1d1f",
    marginTop: 2,
    paddingVertical: 4,
  },
  totalLabel: {
    fontSize: 10,
  },
  totalValue: {
    fontSize: 10,
    textAlign: "right",
  },
  expenseHeader: {
    display: "flex",
    flexDirection: "row",
    borderBottom: "0.5 solid #1d1d1f",
    paddingBottom: 3,
  },
  expenseDetailRow: {
    display: "flex",
    flexDirection: "row",
    paddingVertical: 3,
  },
  dateColumn: {
    width: "21%",
  },
  expenseCategoryColumn: {
    width: "19%",
  },
  descriptionColumn: {
    width: "38%",
  },
  expenseAmountColumn: {
    width: "22%",
    textAlign: "right",
  },
  notice: {
    fontSize: 8.5,
    lineHeight: 1.4,
    marginTop: 4,
  },
});

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
    <View style={total ? [styles.ledgerRow, styles.totalRow] : styles.ledgerRow} wrap={false}>
      <Text style={total ? styles.totalLabel : styles.rowLabel}>{label}</Text>
      <Text style={total ? styles.totalValue : styles.rowValue}>{value}</Text>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function MonthlyReportPdf({ report }: { report: MonthlyReportData }) {
  return (
    <Document title={report.title}>
      <Page size="A4" style={styles.page}>
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

        <View style={styles.section}>
          <SectionTitle>회원 현황</SectionTitle>
          <LedgerRow label="활동 회원" value={`${report.activityMemberCount}명`} />
          <LedgerRow label="회비 부과 대상" value={`${report.feeTargetCount}명`} />
          <LedgerRow label="완납 회원" value={`${report.fullyPaidCount}명`} />
          <LedgerRow label="미납 회원" value={`${report.unpaidCount}명`} />
        </View>

        <View style={styles.section}>
          <SectionTitle>수입</SectionTitle>
          <LedgerRow label="총 청구액" value={`${formatCurrency(report.billedTotal)}원`} />
          <LedgerRow label="실제 회비 수납액" value={`${formatCurrency(report.actualFeeIncome)}원`} />
          <LedgerRow label="인정 납부액" value={`${formatCurrency(report.recognizedPaidTotal)}원`} />
          {report.adjustmentIncome !== 0 ? (
            <LedgerRow label="조정 수납액" value={`${formatCurrency(report.adjustmentIncome)}원`} />
          ) : null}
          <LedgerRow
            label={`미납액 (${report.unpaidCount}명)`}
            value={`${formatCurrency(report.unpaidTotal)}원`}
          />
          <LedgerRow
            label="수입 합계"
            value={`${formatCurrency(report.actualFeeIncome)}원`}
            total
          />
        </View>

        <View style={styles.section}>
          <SectionTitle>지출</SectionTitle>
          {report.expenseCategoryRows.map((row) => (
            <LedgerRow
              key={row.category}
              label={`${formatExpenseCategory(row.category)} (${row.count}건)`}
              value={`${formatCurrency(row.amount)}원`}
            />
          ))}
          <LedgerRow
            label={`지출 합계 (${report.expenseCount}건)`}
            value={`${formatCurrency(report.expenseTotal)}원`}
            total
          />
        </View>

        <View style={styles.section}>
          <SectionTitle>잔액</SectionTitle>
          <LedgerRow
            label="기초 장부 잔액"
            value={formatSettlementBalance(report.openingLedgerBalance)}
          />
          <LedgerRow label="당월 귀속 수지" value={formatSettlementBalance(report.attributedNet)} />
          <LedgerRow
            label="기말 장부 잔액"
            value={formatSettlementBalance(report.closingLedgerBalance)}
            total
          />
          <Text style={styles.notice}>
            기초 장부 잔액 + 당월 귀속 수지 = 기말 장부 잔액
          </Text>
        </View>

        <View style={styles.section}>
          <SectionTitle>지출 상세</SectionTitle>
          <View style={styles.expenseHeader} fixed={false}>
            <Text style={[styles.rowLabel, styles.dateColumn]}>사용일</Text>
            <Text style={[styles.rowLabel, styles.expenseCategoryColumn]}>카테고리</Text>
            <Text style={[styles.rowLabel, styles.descriptionColumn]}>내용</Text>
            <Text style={[styles.rowLabel, styles.expenseAmountColumn]}>금액</Text>
          </View>
          {report.expenseRows.map((row) => (
            <View
              key={`${row.expenseDate}-${row.categoryLabel}-${row.description}`}
              style={styles.expenseDetailRow}
              wrap={false}
            >
              <Text style={[styles.rowLabel, styles.dateColumn]}>{row.expenseDate}</Text>
              <Text style={[styles.rowLabel, styles.expenseCategoryColumn]}>{row.categoryLabel}</Text>
              <Text
                hyphenationCallback={addInvisibleGraphemeBreaks}
                style={[styles.rowLabel, styles.descriptionColumn]}
              >
                {row.description}
              </Text>
              <Text style={[styles.rowLabel, styles.expenseAmountColumn]}>
                {formatCurrency(row.amount)}원
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.notice}>
          회비는 귀속월 기준이며 지출은 사용일 기준입니다.
        </Text>
        <Text style={styles.notice}>
          이 보고서는 회원 공유용으로 개별 납부 내역, 미납 회원명, 영수증 원본, 내부 메모를 포함하지 않습니다.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderMonthlyReportPdf(report: MonthlyReportData) {
  return renderToBuffer(<MonthlyReportPdf report={report} />);
}
