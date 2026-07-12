import { describe, expect, it } from "vitest";
import {
  normalizeMemberInput,
  parseMemberSaveResult,
  toMemberDatabaseInput,
  validateMemberForm,
} from "./member-form";

describe("member form validation", () => {
  it("converts a full contact and group without a withdrawal reason", () => {
    const member = normalizeMemberInput({
      name: " 홍길동 ",
      phoneNumber: "010-1234-5678",
      groupId: "group-a",
      status: "active",
      joinedDate: "2026-07-01",
    });

    expect(validateMemberForm(member)).toEqual([]);
    expect(toMemberDatabaseInput(member)).toEqual({
      name: "홍길동",
      phone_number: "01012345678",
      group_id: "group-a",
      status: "active",
      joined_date: "2026-07-01",
      withdrawn_date: null,
      memo: null,
    });
  });

  it("rejects invalid full phone numbers and dates", () => {
    const member = normalizeMemberInput({
      name: "김민수",
      phoneNumber: "1234",
      joinedDate: "2026/07/01",
    });

    expect(validateMemberForm(member)).toContain(
      "연락처를 올바른 휴대전화 번호로 입력하세요.",
    );
    expect(validateMemberForm(member)).toContain(
      "가입일을 YYYY-MM-DD 형식으로 입력하세요.",
    );
  });
});

describe("parseMemberSaveResult", () => {
  it.each([
    [
      { status: "SAVED", member_code: "A0001" },
      { status: "saved", memberCode: "A0001" },
    ],
    [
      { status: "PHONE_REUSE_CONFIRMATION_REQUIRED" },
      { status: "confirmation-required", reason: "phone-reuse" },
    ],
    [
      { status: "NAME_ONLY_CONFIRMATION_REQUIRED" },
      { status: "confirmation-required", reason: "name-without-phone" },
    ],
    [{ status: "DUPLICATE_BLOCKED" }, { status: "blocked" }],
  ])("maps the database status %j", (databaseResult, expected) => {
    expect(parseMemberSaveResult(databaseResult)).toEqual(expected);
  });
});
