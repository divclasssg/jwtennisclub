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
  it("parses Korean CSV headers into fee payment rows", () => {
    const result = parseFeePaymentsCsv(
      [
        "이름,전화번호끝4자리,납부월,금액,납부일,메모",
        "김민수,1234,2026-07,30000,2026-07-03,7월 회비",
        "이영희,9876,2026-07,30000,2026-07-04,",
      ].join("\n"),
    );

    expect(result).toEqual({
      ok: true,
      payments: [
        {
          name: "김민수",
          phoneLastFour: "1234",
          periodMonth: "2026-07-01",
          amount: 30000,
          paidDate: "2026-07-03",
          memo: "7월 회비",
        },
        {
          name: "이영희",
          phoneLastFour: "9876",
          periodMonth: "2026-07-01",
          amount: 30000,
          paidDate: "2026-07-04",
          memo: null,
        },
      ],
    });
  });

  it("reports the line number for invalid payment rows", () => {
    expect(
      parseFeePaymentsCsv(
        ["name,phoneLastFour,periodMonth,amount,paidDate", "김민수,123,2026-07,0,2026/07/03"].join("\n"),
      ),
    ).toEqual({
      ok: false,
      line: 2,
      message: "전화번호 끝 4자리는 숫자 4자리로 입력하세요.",
    });
  });
});
