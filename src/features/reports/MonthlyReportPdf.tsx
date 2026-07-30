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

const notoSansKrFontPath = path.join(
  process.cwd(),
  "node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-400-normal.woff",
);

Font.register({
  family: "Noto Sans KR",
  src: notoSansKrFontPath,
});

const styles = StyleSheet.create({
  page: {
    padding: 36,
    color: "#1d1d1f",
    fontFamily: "Noto Sans KR",
    fontSize: 10,
    lineHeight: 1.5,
  },
  title: {
    marginBottom: 8,
    fontSize: 20,
  },
  meta: {
    marginBottom: 24,
    color: "#666666",
    fontSize: 9,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    marginBottom: 8,
    fontSize: 13,
  },
  summaryGrid: {
    display: "flex",
    flexDirection: "row",
    gap: 8,
  },
  summaryCard: {
    flexGrow: 1,
    padding: 10,
    border: "1 solid #e0e0e0",
  },
  summaryLabel: {
    marginBottom: 4,
    color: "#666666",
    fontSize: 9,
  },
  summaryValue: {
    fontSize: 14,
  },
  table: {
    border: "1 solid #e0e0e0",
  },
  row: {
    display: "flex",
    flexDirection: "row",
    borderBottom: "1 solid #eeeeee",
  },
  headerCell: {
    padding: 7,
    backgroundColor: "#f5f5f7",
    color: "#666666",
    fontSize: 9,
  },
  cell: {
    padding: 7,
    fontSize: 9,
  },
  categoryColumn: {
    width: "40%",
  },
  countColumn: {
    width: "20%",
  },
  amountColumn: {
    width: "40%",
  },
  dateColumn: {
    width: "22%",
  },
  expenseCategoryColumn: {
    width: "20%",
  },
  descriptionColumn: {
    width: "36%",
  },
  expenseAmountColumn: {
    width: "22%",
  },
  notice: {
    marginTop: 10,
    color: "#666666",
    fontSize: 8,
  },
});

function MonthlyReportPdf({ report }: { report: MonthlyReportData }) {
  return (
    <Document title={report.title}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{report.title}</Text>
        <Text style={styles.meta}>
          생성일 {report.generatedAtLabel} · 생성자 {report.generatedBy}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>정산 요약</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>회비 수입</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(report.incomeTotal)}원
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>운영 지출</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(report.expenseTotal)}원
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>당월 귀속 수지</Text>
              <Text style={styles.summaryValue}>
                {formatSettlementBalance(report.attributedNet)}
              </Text>
            </View>
          </View>
          <Text style={styles.notice}>
            회비 납부 {report.feePaymentCount}건 · 지출 {report.expenseCount}건
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>카테고리별 지출</Text>
          <View style={styles.table}>
            <View style={styles.row}>
              <Text style={[styles.headerCell, styles.categoryColumn]}>
                카테고리
              </Text>
              <Text style={[styles.headerCell, styles.countColumn]}>건수</Text>
              <Text style={[styles.headerCell, styles.amountColumn]}>금액</Text>
            </View>
            {report.expenseCategoryRows.map((row) => (
              <View key={row.category} style={styles.row}>
                <Text style={[styles.cell, styles.categoryColumn]}>
                  {formatExpenseCategory(row.category)}
                </Text>
                <Text style={[styles.cell, styles.countColumn]}>{row.count}건</Text>
                <Text style={[styles.cell, styles.amountColumn]}>
                  {formatCurrency(row.amount)}원
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>주요 지출 내역</Text>
          <View style={styles.table}>
            <View style={styles.row}>
              <Text style={[styles.headerCell, styles.dateColumn]}>사용일</Text>
              <Text style={[styles.headerCell, styles.expenseCategoryColumn]}>
                카테고리
              </Text>
              <Text style={[styles.headerCell, styles.descriptionColumn]}>
                내용
              </Text>
              <Text style={[styles.headerCell, styles.expenseAmountColumn]}>
                금액
              </Text>
            </View>
            {report.majorExpenseRows.map((row) => (
              <View key={`${row.expenseDate}-${row.description}`} style={styles.row}>
                <Text style={[styles.cell, styles.dateColumn]}>
                  {row.expenseDate}
                </Text>
                <Text style={[styles.cell, styles.expenseCategoryColumn]}>
                  {row.categoryLabel}
                </Text>
                <Text style={[styles.cell, styles.descriptionColumn]}>
                  {row.description}
                </Text>
                <Text style={[styles.cell, styles.expenseAmountColumn]}>
                  {formatCurrency(row.amount)}원
                </Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.notice}>
          이 보고서는 회원 공유용으로 개별 납부 내역, 미납 회원명, 영수증 원본,
          내부 메모를 포함하지 않습니다.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderMonthlyReportPdf(report: MonthlyReportData) {
  return renderToBuffer(<MonthlyReportPdf report={report} />);
}
