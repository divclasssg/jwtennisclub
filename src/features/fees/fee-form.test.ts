import { describe, expect, it } from "vitest";
import {
  normalizeFeePaymentInput,
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
