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
    marginBottom: 8,
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
    flexWrap: "wrap",
    gap: 8,
  },
  summaryCard: {
    flexGrow: 1,
    flexBasis: "22%",
    padding: 10,
    border: "1 solid #e0e0e0",
  },
  summaryLabel: {
    marginBottom: 4,
    color: "#666666",
    fontSize: 9,
  },
  summaryValue: {
    fontSize: 12,
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

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

export function MonthlyReportPdf({ report }: { report: MonthlyReportData }) {
  const hasNoFeeTargets = report.feeTargetCount === 0;

  return (
    <Document title={report.title}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{report.title}</Text>
        <Text style={styles.meta}>
          마감 버전 v{report.closingVersion} · 마감일 {report.closedAtLabel} · 마감 처리자 {report.closedBy}
        </Text>
        <Text style={styles.meta}>
          PDF 생성일 {report.generatedAtLabel} · 생성자 {report.generatedBy}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>회원 및 회비 현황</Text>
          <View style={styles.summaryGrid}>
            <SummaryCard label="월말 활동 회원" value={`${report.activityMemberCount}명`} />
            <SummaryCard label="회비 부과 대상" value={`${report.feeTargetCount}명`} />
            <SummaryCard label="완납 회원" value={`${report.fullyPaidCount}명`} />
            <SummaryCard label="미납 회원" value={`${report.unpaidCount}명`} />
          </View>
          {hasNoFeeTargets ? (
            <Text style={styles.notice}>해당 월 회비 부과 대상 회원이 없습니다.</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>회비 및 지출 현황</Text>
          <View style={styles.summaryGrid}>
            <SummaryCard label="총 청구액" value={`${formatCurrency(report.billedTotal)}원`} />
            <SummaryCard label="실제 회비 수납액" value={`${formatCurrency(report.actualFeeIncome)}원`} />
            <SummaryCard label="인정 납부액" value={`${formatCurrency(report.recognizedPaidTotal)}원`} />
            {report.adjustmentIncome !== 0 ? (
              <SummaryCard label="조정 수납액" value={`${formatCurrency(report.adjustmentIncome)}원`} />
            ) : null}
            <SummaryCard label="미납액" value={`${formatCurrency(report.unpaidTotal)}원`} />
            <SummaryCard label="운영 지출" value={`${formatCurrency(report.expenseTotal)}원`} />
            <SummaryCard label="당월 귀속 수지" value={formatSettlementBalance(report.attributedNet)} />
            <SummaryCard label="기초 장부 잔액" value={formatSettlementBalance(report.openingLedgerBalance)} />
            <SummaryCard label="기말 장부 잔액" value={formatSettlementBalance(report.closingLedgerBalance)} />
          </View>
          <Text style={styles.notice}>운영 지출 {report.expenseCount}건</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>카테고리별 지출</Text>
          <View style={styles.table}>
            <View style={styles.row}>
              <Text style={[styles.headerCell, styles.categoryColumn]}>카테고리</Text>
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
          <Text style={styles.sectionTitle}>지출 내역</Text>
          <View style={styles.table}>
            <View style={styles.row}>
              <Text style={[styles.headerCell, styles.dateColumn]}>사용일</Text>
              <Text style={[styles.headerCell, styles.expenseCategoryColumn]}>카테고리</Text>
              <Text style={[styles.headerCell, styles.descriptionColumn]}>내용</Text>
              <Text style={[styles.headerCell, styles.expenseAmountColumn]}>금액</Text>
            </View>
            {report.expenseRows.map((row) => (
              <View key={`${row.expenseDate}-${row.categoryLabel}-${row.description}`} style={styles.row}>
                <Text style={[styles.cell, styles.dateColumn]}>{row.expenseDate}</Text>
                <Text style={[styles.cell, styles.expenseCategoryColumn]}>{row.categoryLabel}</Text>
                <Text style={[styles.cell, styles.descriptionColumn]}>{row.description}</Text>
                <Text style={[styles.cell, styles.expenseAmountColumn]}>{formatCurrency(row.amount)}원</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.notice}>
          회비는 귀속월 기준이며 지출은 사용일 기준입니다. 당월 귀속 수지는 실제 회비 수납액에서 운영 지출을 뺀 금액입니다.
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
