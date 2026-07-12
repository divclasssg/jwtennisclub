import { describe, expect, it } from "vitest";
import {
  normalizeFeePaymentInput,
  parseFeePaymentsCsv,
  toFeePaymentDatabaseInput,
  validateFeePaymentForm,
} from "./fee-form";

describe("fee payment form validation", () => {
  it("accepts a valid fee payment", () => {
    const payment = normalizeFeePaymentInput({
      memberId: "member-id",
      periodMonth: "2026-07",
      amount: "30000",
      paidDate: "2026-07-03",
      memo: "7월 회비",
    });

    expect(validateFeePaymentForm(payment)).toEqual([]);
    expect(toFeePaymentDatabaseInput(payment)).toEqual({
      member_id: "member-id",
      period_month: "2026-07-01",
      amount: 30000,
      paid_date: "2026-07-03",
      memo: "7월 회비",
    });
  });

  it("rejects missing members, invalid months, invalid amounts, and invalid paid dates", () => {
    const payment = normalizeFeePaymentInput({
      memberId: "",
      periodMonth: "2026/07",
      amount: "0",
      paidDate: "2026/07/03",
    });

    expect(validateFeePaymentForm(payment)).toEqual([
      "회원을 선택하세요.",
      "납부 월을 YYYY-MM 형식으로 입력하세요.",
      "납부 금액은 1원 이상의 정수로 입력하세요.",
      "납부일을 YYYY-MM-DD 형식으로 입력하세요.",
    ]);
  });
});

describe("parseFeePaymentsCsv", () => {
  it("회비 CSV를 영구 회원번호로 파싱한다", () => {
    const result = parseFeePaymentsCsv(
      [
        "회원번호,납부월,금액,납부일,메모",
        "M0001,2026-07,30000,2026-07-03,7월 회비",
        "m0002,2026-07,30000,2026-07-04,",
      ].join("\n"),
    );

    expect(result).toEqual({
      ok: true,
      payments: [
        {
          memberCode: "M0001",
          periodMonth: "2026-07-01",
          amount: 30000,
          paidDate: "2026-07-03",
          memo: "7월 회비",
        },
        {
          memberCode: "M0002",
          periodMonth: "2026-07-01",
          amount: 30000,
          paidDate: "2026-07-04",
          memo: null,
        },
      ],
    });
  });

  it("전화번호 헤더로 회원을 찾지 않는다", () => {
    expect(
      parseFeePaymentsCsv(
        `이름,전화번호${"끝4자리"},납부월,금액,납부일\n홍길동,5678,2026-07,30000,2026-07-05`,
      ),
    ).toMatchObject({
      ok: false,
      line: 1,
    });
  });
});
