import { describe, expect, it } from "vitest";
import { renderMonthlyReportPdf } from "./MonthlyReportPdf";

describe("renderMonthlyReportPdf", () => {
  it("renders a Korean monthly report as a PDF buffer", async () => {
    const pdf = await renderMonthlyReportPdf({
      title: "2026년 6월 테니스 클럽 월간 정산 보고서",
      periodLabel: "2026.06",
      generatedAtLabel: "2026.07.05",
      generatedBy: "김운영",
      incomeTotal: 80000,
      expenseTotal: 130000,
      balance: -50000,
      feePaymentCount: 2,
      expenseCount: 1,
      expenseCategoryRows: [{ category: "court", amount: 130000, count: 1 }],
      majorExpenseRows: [
        {
          expenseDate: "2026.06.12",
          categoryLabel: "코트",
          description: "코트 대관",
          amount: 130000,
        },
      ],
    });

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
