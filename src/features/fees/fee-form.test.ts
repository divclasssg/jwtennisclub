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

  it("rejects a memo longer than 500 characters", () => {
    const payment = normalizeFeePaymentInput({
      memberId: "member-id",
      periodMonth: "2026-07",
      amount: "30000",
      paidDate: "2026-07-03",
      memo: "가".repeat(501),
    });

    expect(validateFeePaymentForm(payment)).toContain(
      "메모는 500자 이하로 입력하세요.",
    );
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
      sourceLines: [2, 3],
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

  it("빈 행을 건너뛰고 원본 CSV 행 번호를 보존한다", () => {
    const result = parseFeePaymentsCsv(
      [
        "회원번호,납부월,금액,납부일",
        "",
        "M0001,2026-07,30000,2026-07-03",
        "   , , , ",
        "M0002,2026-07,30000,2026-07-04",
      ].join("\n"),
    );

    expect(result).toMatchObject({
      ok: true,
      sourceLines: [3, 5],
      payments: [{ memberCode: "M0001" }, { memberCode: "M0002" }],
    });
  });

  it("CRLF CSV에서도 빈 행 뒤의 원본 행 번호를 보존한다", () => {
    const result = parseFeePaymentsCsv(
      [
        "회원번호,납부월,금액,납부일",
        "",
        "M0001,2026-07,30000,2026-07-03",
      ].join("\r\n"),
    );

    expect(result).toMatchObject({
      ok: true,
      sourceLines: [3],
      payments: [{ memberCode: "M0001" }],
    });
  });

  it("따옴표 셀의 여러 줄과 빈 행 뒤에도 실제 시작 행을 보존한다", () => {
    const result = parseFeePaymentsCsv(
      [
        "회원번호,납부월,금액,납부일,메모",
        'M0001,2026-07,30000,2026-07-03,"첫 줄',
        '둘째 줄"',
        "",
        "M0002,2026-07,30000,2026-07-04,후속 납부",
      ].join("\n"),
    );

    expect(result).toMatchObject({
      ok: true,
      sourceLines: [2, 5],
      payments: [
        { memberCode: "M0001", memo: "첫 줄\n둘째 줄" },
        { memberCode: "M0002", memo: "후속 납부" },
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

  it("500자 메모는 허용하고 501자 메모는 원본 행에서 거부한다", () => {
    expect(
      parseFeePaymentsCsv(
        `회원번호,납부월,금액,납부일,메모\nM0001,2026-07,30000,2026-07-03,${"가".repeat(500)}`,
      ),
    ).toMatchObject({ ok: true, sourceLines: [2] });

    expect(
      parseFeePaymentsCsv(
        `회원번호,납부월,금액,납부일,메모\nM0001,2026-07,30000,2026-07-03,${"가".repeat(501)}`,
      ),
    ).toEqual({
      ok: false,
      line: 2,
      message: "메모는 500자 이하로 입력하세요.",
    });
  });
});
