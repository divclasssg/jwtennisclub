import { describe, expect, it } from "vitest";
import {
  normalizeMemberInput,
  parseMembersCsv,
  toMemberDatabaseInput,
  validateMemberForm,
} from "./member-form";

describe("member form validation", () => {
  it("accepts a valid active member", () => {
    const member = normalizeMemberInput({
      name: "김민수",
      phoneLastFour: "1234",
      joinedDate: "2026-07-01",
    });

    expect(validateMemberForm(member)).toEqual([]);
    expect(toMemberDatabaseInput(member)).toMatchObject({
      name: "김민수",
      phone_last_four: "1234",
      status: "active",
      joined_date: "2026-07-01",
    });
  });

  it("rejects full phone numbers and invalid dates", () => {
    const member = normalizeMemberInput({
      name: "김민수",
      phoneLastFour: "01012341234",
      joinedDate: "2026/07/01",
    });

    expect(validateMemberForm(member)).toContain(
      "전화번호는 끝 4자리 숫자만 입력하세요.",
    );
    expect(validateMemberForm(member)).toContain(
      "가입일을 YYYY-MM-DD 형식으로 입력하세요.",
    );
  });
});

describe("parseMembersCsv", () => {
  it("parses Korean CSV headers into member inputs", () => {
    const result = parseMembersCsv(
      [
        "이름,전화번호끝4자리,가입일,상태,탈퇴일,탈퇴사유,메모",
        "김민수,1234,2026-07-01,활동중,,,",
        "이영희,9876,2026-06-01,탈퇴,2026-07-01,이사,",
      ].join("\n"),
    );

    expect(result).toEqual({
      ok: true,
      members: [
        {
          name: "김민수",
          phoneLastFour: "1234",
          status: "active",
          joinedDate: "2026-07-01",
          withdrawnDate: null,
          withdrawalReason: null,
          memo: null,
        },
        {
          name: "이영희",
          phoneLastFour: "9876",
          status: "withdrawn",
          joinedDate: "2026-06-01",
          withdrawnDate: "2026-07-01",
          withdrawalReason: "이사",
          memo: null,
        },
      ],
    });
  });

  it("reports the line number for invalid rows", () => {
    expect(
      parseMembersCsv(["name,phone_last_four,joined_date", "김민수,0101234,2026-07-01"].join("\n")),
    ).toEqual({
      ok: false,
      line: 2,
      message: "전화번호는 끝 4자리 숫자만 입력하세요.",
    });
  });
});
