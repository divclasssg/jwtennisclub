import { describe, expect, it } from "vitest";
import {
  maskPhoneNumber,
  normalizePhoneNumber,
  validatePhoneNumber,
} from "./member-contact";

describe("member contact", () => {
  it.each([
    ["010-1234-5678", "01012345678"],
    ["010 1234 5678", "01012345678"],
    ["", null],
  ])("normalizes phone number %s", (source, expected) => {
    expect(normalizePhoneNumber(source)).toBe(expected);
  });

  it("accepts an empty or valid mobile phone number", () => {
    expect(validatePhoneNumber(null)).toEqual([]);
    expect(validatePhoneNumber("01012345678")).toEqual([]);
  });

  it("rejects an invalid mobile phone number", () => {
    expect(validatePhoneNumber("0212345678")).toEqual([
      "연락처를 올바른 휴대전화 번호로 입력하세요.",
    ]);
  });

  it("masks the middle digits without exposing the source", () => {
    expect(maskPhoneNumber("01012345678")).toBe("010-****-5678");
  });

  it("labels a missing phone number", () => {
    expect(maskPhoneNumber(null)).toBe("연락처 없음");
  });
});
