import { describe, expect, it } from "vitest";
import {
  normalizeMemberInput,
  parseMemberFormData,
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
      pause_start_month: null,
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

  it("normalizes a paused member's start month for storage", () => {
    const member = normalizeMemberInput({
      name: "엄다해",
      status: "paused",
      joinedDate: "2026-01-01",
      pauseStartMonth: "2026-08",
    });

    expect(validateMemberForm(member)).toEqual([]);
    expect(toMemberDatabaseInput(member)).toMatchObject({
      status: "paused",
      pause_start_month: "2026-08-01",
    });
  });

  it("reads and normalizes the pause start month from form data", () => {
    const formData = new FormData();
    formData.set("name", "엄다해");
    formData.set("status", "paused");
    formData.set("joinedDate", "2026-01-01");
    formData.set("pauseStartMonth", "2026-08");

    expect(parseMemberFormData(formData).pauseStartMonth).toBe("2026-08-01");
  });

  it.each([
    [
      "requires a start month for paused members",
      { status: "paused" },
      "휴회 회원은 휴회 시작 월이 필요합니다.",
    ],
    [
      "rejects a malformed pause start month",
      { status: "paused", pauseStartMonth: "2026/08" },
      "휴회 시작 월을 YYYY-MM 형식으로 입력하세요.",
    ],
    [
      "rejects a pause start month for a non-paused member",
      { status: "active", pauseStartMonth: "2026-08" },
      "활동중 또는 탈퇴 회원은 휴회 시작 월을 비워야 합니다.",
    ],
  ])("%s", (_description, overrides, expectedError) => {
    const member = normalizeMemberInput({
      name: "엄다해",
      joinedDate: "2026-01-01",
      ...overrides,
    });

    expect(validateMemberForm(member)).toContain(expectedError);
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
