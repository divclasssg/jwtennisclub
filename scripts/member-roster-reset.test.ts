import { createHash } from "node:crypto";
import { lstat, mkdtemp, mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  buildResetPreview,
  parseRosterCsv,
  resolveRosterPath,
  runRosterReset,
} from "./member-roster-reset.mjs";

const validCsv = [
  "ID,이름,전화번호,구분,직책,Group,상태,가입일",
  "M0001,홍길동,010-1234-5678,정회원,회원,A,활동중,2026.7.1",
].join("\n");

describe("parseRosterCsv", () => {
  it("필요한 열만 ResetRosterRow로 변환한다", () => {
    expect(parseRosterCsv(validCsv)).toEqual([
      {
        memberCode: "M0001",
        name: "홍길동",
        phoneNumber: "01012345678",
        groupCode: "A",
        status: "active",
        joinedDate: "2026-07-01",
      },
    ]);
  });

  it("따옴표 안의 쉼표와 줄바꿈을 보존한다", () => {
    const csv = [
      "ID,이름,전화번호,Group,상태,가입일",
      'M0001,"홍,\n길동",01012345678,A,활동중,2026-07-01',
    ].join("\n");

    expect(parseRosterCsv(csv)[0]?.name).toBe("홍,\n길동");
  });

  it.each([
    ['M0001,홍"길동,01012345678,A,활동중,2026-07-01', "unquoted quote"],
    ['M0001,"홍길동"x,01012345678,A,활동중,2026-07-01', "junk after quote"],
    ['M0001,"홍길동,01012345678,A,활동중,2026-07-01', "unterminated quote"],
  ])("잘못된 CSV 따옴표를 차단한다: %s", (dataRow) => {
    const csv = ["ID,이름,전화번호,Group,상태,가입일", dataRow].join("\n");
    expect(() => parseRosterCsv(csv)).toThrow(/CSV/);
  });

  it("전화번호 허용 문자 밖의 문자를 정규화 전에 차단한다", () => {
    expect(() => parseRosterCsv(validCsv.replace("010-1234-5678", "010-call-5678"))).toThrow(/전화번호/);
  });

  it("CRLF, 빈 줄, 멀티라인 필드 뒤 오류의 실제 시작 행을 보고한다", () => {
    const csv = [
      "ID,이름,전화번호,Group,상태,가입일",
      "",
      'M0001,"합성\r\n이름",01012345678,A,활동중,2026-07-01',
      "M0002,다른합성,01099998888,C,활동중,2026-07-02",
    ].join("\r\n");
    expect(() => parseRosterCsv(csv)).toThrow(/CSV 5행/);
  });

  it.each([
    ["중복 ID", validCsv + "\nM0001,김철수,010-9999-8888,정회원,회원,B,활동중,2026.7.2"],
    ["이름과 전화번호 중복", validCsv + "\nM0002, 홍길동 ,01012345678,정회원,회원,B,활동중,2026.7.2"],
    ["알 수 없는 그룹", validCsv.replace(",A,활동중", ",C,활동중")],
    ["ID 형식", validCsv.replace("M0001", "M001")],
    ["ID 접두사", validCsv + "\nA0002,김철수,01099998888,정회원,회원,B,활동중,2026.7.2"],
    ["알 수 없는 상태", validCsv.replace("활동중", "대기")],
    ["날짜", validCsv.replace("2026.7.1", "2026.2.30")],
  ])("%s 오류를 PII 없이 차단한다", (_label, csv) => {
    expect(() => parseRosterCsv(csv)).toThrow();
    try {
      parseRosterCsv(csv);
    } catch (error) {
      const message = String(error);
      expect(message).not.toContain("홍길동");
      expect(message).not.toContain("01012345678");
    }
  });

  it("대시는 null 그룹, 빈 연락처는 null로 변환한다", () => {
    const csv = validCsv.replace("010-1234-5678", "").replace(",A,활동중", ",- ,활동중");
    expect(parseRosterCsv(csv)[0]).toMatchObject({ phoneNumber: null, groupCode: null });
  });

  it("필수 헤더 누락과 중복 헤더를 차단한다", () => {
    expect(() => parseRosterCsv("ID,이름,전화번호,Group,상태\nM0001,홍길동,,A,활동중")).toThrow();
    expect(() => parseRosterCsv("ID,이름,이름,전화번호,Group,상태,가입일\nM0001,홍길동,홍길동,,A,활동중,2026-01-01")).toThrow();
  });

  it.each(["탈퇴", "withdrawn"])("탈퇴 상태는 withdrawn_date가 없는 reset CSV에서 차단한다: %s", (status) => {
    expect(() => parseRosterCsv(validCsv.replace("활동중", status))).toThrow(/상태/);
  });
});

describe("buildResetPreview", () => {
  it("비식별 집계와 프로필 연결 수만 반환한다", () => {
    const preview = buildResetPreview(parseRosterCsv(validCsv), [{ id: "profile-1", name: " 홍길동 " }]);
    expect(preview).toMatchObject({ rowCount: 1, groupCounts: { A: 1, B: 0, unassigned: 0 }, missingPhoneCount: 0, reconnectedProfileCount: 1 });
    expect(JSON.stringify(preview)).not.toContain("홍길동");
    expect(JSON.stringify(preview)).not.toContain("01012345678");
  });

  it("운영자 이름의 누락과 복수 일치를 차단한다", () => {
    const rows = parseRosterCsv(validCsv);
    expect(() => buildResetPreview(rows, [{ id: "profile-1", name: "없는이름" }])).toThrow(/프로필/);
    expect(() => buildResetPreview([...rows, { ...rows[0]!, memberCode: "M0002", phoneNumber: "01099998888" }], [{ id: "profile-1", name: "홍길동" }])).toThrow(/프로필/);
  });

  it("정규화된 프로필 이름 자체의 중복도 차단한다", () => {
    expect(() => buildResetPreview(parseRosterCsv(validCsv), [
      { id: "profile-1", name: "홍길동" },
      { id: "profile-2", name: " 홍길동 " },
    ])).toThrow(/프로필/);
  });
});

describe("runRosterReset", () => {
  const file = { path: "members/members.csv", source: validCsv };
  const profiles = [{ id: "profile-1", name: "홍길동" }];

  it("기본 dry-run은 쓰기 없이 SHA-256과 비식별 미리보기만 반환한다", async () => {
    const rpc = vi.fn();
    const result = await runRosterReset({ ...file, profiles, rpc });
    expect(result.executed).toBe(false);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(rpc).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("홍길동");
    expect(JSON.stringify(result)).not.toContain("01012345678");
  });

  it("SHA-256은 디코딩된 문자열이 아니라 원본 바이트를 기준으로 한다", async () => {
    const sourceBytes = Buffer.from(validCsv, "utf16le");
    const utf8Bytes = Buffer.from(validCsv, "utf8");
    const result = await runRosterReset({ ...file, sourceBytes, source: validCsv, profiles, rpc: vi.fn() });
    expect(result.sha256).toBe(createHash("sha256").update(sourceBytes).digest("hex"));
    expect(result.sha256).not.toBe(createHash("sha256").update(utf8Bytes).digest("hex"));
  });

  it("정확한 입력 경로만 허용한다", async () => {
    await expect(runRosterReset({ ...file, path: "./members/members.csv", profiles, rpc: vi.fn() })).rejects.toThrow(/경로/);
  });

  it("실행은 두 확인 플래그와 service role key를 모두 요구한다", async () => {
    await expect(runRosterReset({ ...file, profiles, execute: true, confirmation: "RESET_MEMBERS_AND_FEES", expectedSha256: "bad", serviceRoleKey: "secret", rpc: vi.fn() })).rejects.toThrow(/확인/);
    const sha256 = (await runRosterReset({ ...file, profiles, rpc: vi.fn() })).sha256;
    await expect(runRosterReset({ ...file, profiles, execute: true, confirmation: "RESET_MEMBERS_AND_FEES", expectedSha256: sha256, rpc: vi.fn() })).rejects.toThrow(/service role/i);
  });

  it("RPC를 정확히 한 번 호출하고 반환 카운트를 검증한다", async () => {
    const dryRun = await runRosterReset({ ...file, profiles, rpc: vi.fn() });
    const rpc = vi.fn().mockResolvedValue({ imported_count: 1, reconnected_profile_count: 1 });
    const result = await runRosterReset({ ...file, profiles, execute: true, confirmation: "RESET_MEMBERS_AND_FEES", expectedSha256: dryRun.sha256, serviceRoleKey: "secret", rpc });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(result.executed).toBe(true);

    const badRpc = vi.fn().mockResolvedValue({ imported_count: 0, reconnected_profile_count: 1 });
    await expect(runRosterReset({ ...file, profiles, execute: true, confirmation: "RESET_MEMBERS_AND_FEES", expectedSha256: dryRun.sha256, serviceRoleKey: "secret", rpc: badRpc })).rejects.toThrow(/결과/);
  });
});

describe("resolveRosterPath", () => {
  it("저장소 루트 기준 상대 경로와 같은 절대 경로만 허용한다", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "roster-repo-"));
    await mkdir(join(repoRoot, "members"));
    const intendedPath = join(repoRoot, "members", "members.csv");
    await writeFile(intendedPath, "synthetic");
    const fs = { lstat, realpath };

    await expect(resolveRosterPath("members/members.csv", { repoRoot, fs })).resolves.toBe(intendedPath);
    await expect(resolveRosterPath(intendedPath, { repoRoot, fs })).resolves.toBe(intendedPath);
    await expect(resolveRosterPath(join(repoRoot, "members", "other.csv"), { repoRoot, fs })).rejects.toThrow(/경로/);
  });

  it("의도한 파일과 입력 경로의 심볼릭 링크를 모두 차단한다", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "roster-repo-"));
    await mkdir(join(repoRoot, "members"));
    const target = join(repoRoot, "target.csv");
    const intendedPath = join(repoRoot, "members", "members.csv");
    await writeFile(target, "synthetic");
    await symlink(target, intendedPath);

    await expect(resolveRosterPath(intendedPath, { repoRoot, fs: { lstat, realpath } })).rejects.toThrow(/심볼릭 링크/);
  });

  it("members parent 디렉터리의 심볼릭 링크 탈출을 차단한다", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "roster-repo-"));
    const outsideRoot = await mkdtemp(join(tmpdir(), "roster-outside-"));
    await writeFile(join(outsideRoot, "members.csv"), "synthetic");
    await symlink(outsideRoot, join(repoRoot, "members"));

    await expect(resolveRosterPath("members/members.csv", { repoRoot, fs: { lstat, realpath } })).rejects.toThrow(/심볼릭 링크|디렉터리/);
  });
});
