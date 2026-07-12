import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REQUIRED_HEADERS = ["ID", "이름", "전화번호", "Group", "상태", "가입일"];
const STATUS_MAP = new Map([
  ["활동중", "active"],
  ["활동", "active"],
  ["active", "active"],
  ["휴회", "paused"],
  ["paused", "paused"],
]);

function fail(message, rowNumber) {
  throw new Error(rowNumber ? `CSV ${rowNumber}행: ${message}` : message);
}

function parseCsvRecords(source) {
  const records = [];
  let record = [];
  let field = "";
  let state = "unquoted";
  let physicalLine = 1;
  let recordStartLine = 1;

  const finishRecord = () => {
    record.push(field);
    if (record.some((value) => value !== "")) {
      records.push({ fields: record, sourceLine: recordStartLine });
    }
    record = [];
    field = "";
    state = "unquoted";
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const isNewline = character === "\n" || character === "\r";

    if (state === "quoted") {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        state = "after-quote";
      } else {
        field += character;
        if (isNewline) {
          if (character === "\r" && source[index + 1] === "\n") {
            field += "\n";
            index += 1;
          }
          physicalLine += 1;
        }
      }
    } else if (state === "after-quote") {
      if (character === ",") {
        record.push(field);
        field = "";
        state = "unquoted";
      } else if (isNewline) {
        finishRecord();
        if (character === "\r" && source[index + 1] === "\n") index += 1;
        physicalLine += 1;
        recordStartLine = physicalLine;
      } else {
        fail("닫는 따옴표 뒤에 허용되지 않은 문자가 있습니다.", recordStartLine);
      }
    } else if (character === '"') {
      if (field !== "") fail("따옴표는 필드 시작에서만 사용할 수 있습니다.", recordStartLine);
      state = "quoted";
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (isNewline) {
      finishRecord();
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      physicalLine += 1;
      recordStartLine = physicalLine;
    } else {
      field += character;
    }
  }

  if (state === "quoted") fail("닫히지 않은 따옴표가 있습니다.", recordStartLine);
  finishRecord();
  return records;
}

function normalizeName(value) {
  return value.trim().normalize("NFKC").toLocaleLowerCase("ko-KR");
}

function parseDate(value, rowNumber) {
  const match = value.trim().match(/^(\d{4})[.-](\d{1,2})[.-](\d{1,2})$/);
  if (!match) fail("가입일 형식이 올바르지 않습니다.", rowNumber);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    fail("가입일이 유효하지 않습니다.", rowNumber);
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseRosterCsv(source) {
  const records = parseCsvRecords(source.replace(/^\uFEFF/, ""));
  if (records.length < 2) fail("헤더와 한 개 이상의 데이터 행이 필요합니다.");

  const headers = records[0].fields.map((header) => header.trim());
  if (new Set(headers).size !== headers.length) fail("중복 헤더가 있습니다.");
  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(required)) fail(`필수 헤더가 없습니다: ${required}`);
  }

  const rows = [];
  const memberCodes = new Set();
  const namePhones = new Set();
  let memberCodePrefix;

  for (let index = 1; index < records.length; index += 1) {
    const { fields: record, sourceLine: rowNumber } = records[index];
    if (record.length !== headers.length) fail("열 개수가 헤더와 다릅니다.", rowNumber);
    const values = Object.fromEntries(headers.map((header, column) => [header, record[column]?.trim() ?? ""]));
    const memberCode = values.ID;
    const codeMatch = memberCode.match(/^([A-Z])[0-9]{4}$/);
    if (!codeMatch) fail("ID 형식이 올바르지 않습니다.", rowNumber);
    if (memberCodePrefix && memberCodePrefix !== codeMatch[1]) fail("ID 접두사가 일관되지 않습니다.", rowNumber);
    memberCodePrefix ??= codeMatch[1];
    if (memberCodes.has(memberCode)) fail("중복 ID가 있습니다.", rowNumber);
    memberCodes.add(memberCode);

    const name = values["이름"];
    if (!name) fail("이름이 비어 있습니다.", rowNumber);
    const rawPhone = values["전화번호"];
    if (rawPhone && !/^[0-9 ()-]+$/.test(rawPhone)) fail("전화번호에 허용되지 않은 문자가 있습니다.", rowNumber);
    const phoneNumber = rawPhone ? rawPhone.replace(/[^0-9]/g, "") : null;
    if (phoneNumber && !/^01[016789][0-9]{7,8}$/.test(phoneNumber)) fail("전화번호 형식이 올바르지 않습니다.", rowNumber);
    if (phoneNumber) {
      const duplicateKey = `${normalizeName(name)}\u0000${phoneNumber}`;
      if (namePhones.has(duplicateKey)) fail("이름과 전화번호가 중복됩니다.", rowNumber);
      namePhones.add(duplicateKey);
    }

    const rawGroup = values.Group.trim();
    const groupCode = rawGroup === "-" || rawGroup === "" ? null : rawGroup;
    if (groupCode !== null && groupCode !== "A" && groupCode !== "B") fail("그룹 값이 올바르지 않습니다.", rowNumber);
    const status = STATUS_MAP.get(values["상태"]);
    if (!status) fail("상태 값이 올바르지 않습니다.", rowNumber);

    rows.push({ memberCode, name, phoneNumber, groupCode, status, joinedDate: parseDate(values["가입일"], rowNumber) });
  }
  return rows;
}

export function buildResetPreview(rows, linkedProfiles) {
  const memberNames = new Map();
  for (const row of rows) {
    const normalized = normalizeName(row.name);
    memberNames.set(normalized, (memberNames.get(normalized) ?? 0) + 1);
  }
  const profileNames = new Set();
  for (const profile of linkedProfiles) {
    const normalized = normalizeName(profile.name ?? "");
    if (!normalized || profileNames.has(normalized) || memberNames.get(normalized) !== 1) {
      fail("운영자 프로필은 가져올 회원 한 명과 정확히 일치해야 합니다.");
    }
    profileNames.add(normalized);
  }

  return {
    rowCount: rows.length,
    groupCounts: {
      A: rows.filter((row) => row.groupCode === "A").length,
      B: rows.filter((row) => row.groupCode === "B").length,
      unassigned: rows.filter((row) => row.groupCode === null).length,
    },
    missingPhoneCount: rows.filter((row) => row.phoneNumber === null).length,
    reconnectedProfileCount: linkedProfiles.length,
  };
}

export async function runRosterReset(options) {
  if (options.path !== "members/members.csv") fail("입력 경로는 정확히 members/members.csv여야 합니다.");
  const sha256 = createHash("sha256").update(options.sourceBytes ?? Buffer.from(options.source, "utf8")).digest("hex");
  const rows = parseRosterCsv(options.source);
  const preview = buildResetPreview(rows, options.profiles);

  if (!options.execute) return { executed: false, sha256, ...preview };
  if (options.confirmation !== "RESET_MEMBERS_AND_FEES" || options.expectedSha256 !== sha256) {
    fail("실행 확인 문구 또는 SHA-256이 일치하지 않습니다.");
  }
  if (!options.serviceRoleKey) fail("SUPABASE_SERVICE_ROLE_KEY service role key가 필요합니다.");

  const result = await options.rpc(rows.map((row) => ({
    member_code: row.memberCode,
    name: row.name,
    phone_number: row.phoneNumber,
    group_code: row.groupCode,
    status: row.status,
    joined_date: row.joinedDate,
  })), options.confirmation);
  if (result.imported_count !== preview.rowCount || result.reconnected_profile_count !== preview.reconnectedProfileCount) {
    fail("초기화 결과 카운트가 미리보기와 일치하지 않습니다.");
  }
  return { executed: true, sha256, ...preview };
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function resolveRosterPath(inputPath, options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const fs = options.fs ?? { lstat, realpath };
  const membersPath = resolve(repoRoot, "members");
  const intendedPath = resolve(membersPath, "members.csv");
  const candidatePath = isAbsolute(inputPath) ? resolve(inputPath) : resolve(repoRoot, inputPath);
  if (candidatePath !== intendedPath) fail("입력 경로는 저장소의 members/members.csv여야 합니다.");

  const repoStat = await fs.lstat(repoRoot);
  if (repoStat.isSymbolicLink() || !repoStat.isDirectory()) fail("저장소 루트는 심볼릭 링크가 아닌 디렉터리여야 합니다.");
  const membersStat = await fs.lstat(membersPath);
  if (membersStat.isSymbolicLink() || !membersStat.isDirectory()) fail("members 경로는 심볼릭 링크가 아닌 디렉터리여야 합니다.");
  const candidateStat = await fs.lstat(candidatePath);
  if (candidateStat.isSymbolicLink()) fail("입력 CSV는 심볼릭 링크일 수 없습니다.");
  if (!candidateStat.isFile()) fail("입력 CSV는 일반 파일이어야 합니다.");
  const [realRepoRoot, realMembersPath, candidateRealPath, intendedRealPath] = await Promise.all([
    fs.realpath(repoRoot),
    fs.realpath(membersPath),
    fs.realpath(candidatePath),
    fs.realpath(intendedPath),
  ]);
  if (realMembersPath !== resolve(realRepoRoot, "members")) {
    fail("members 디렉터리가 저장소 루트 밖을 가리킬 수 없습니다.");
  }
  if (candidateRealPath !== intendedRealPath) {
    fail("입력 CSV가 허용된 파일을 가리키지 않습니다.");
  }
  return intendedPath;
}

async function readRosterBytes(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) fail("입력 CSV는 일반 파일이어야 합니다.");
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function loadDatabaseContext(url, serviceRoleKey) {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const [{ data: groups, error: groupError }, { data: profiles, error: profileError }] = await Promise.all([
    supabase.from("member_groups").select("code").in("code", ["A", "B"]).eq("is_active", true),
    supabase.from("members").select("operator_profile_id, name").not("operator_profile_id", "is", null),
  ]);
  if (groupError || profileError) fail("초기화 사전검증 데이터를 불러오지 못했습니다.");
  const codes = new Set((groups ?? []).map((group) => group.code));
  if (codes.size !== 2 || !codes.has("A") || !codes.has("B")) fail("활성 A/B 그룹을 확인할 수 없습니다.");
  return {
    profiles: (profiles ?? []).map((profile) => ({ id: profile.operator_profile_id, name: profile.name })),
    rpc: async (rows, confirmation) => {
      const { data, error } = await supabase.rpc("admin_reset_member_roster", { import_rows: rows, confirmation });
      if (error) fail("회원 명부 초기화 RPC가 실패했습니다.");
      return data;
    },
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const inputPath = argv.find((argument) => !argument.startsWith("--"));
  if (!inputPath) fail("CSV 경로가 필요합니다.");
  const path = await resolveRosterPath(inputPath);
  const execute = argv.includes("--execute");
  const confirmation = argv.find((value) => value.startsWith("--confirm="))?.slice("--confirm=".length);
  const expectedSha256 = argv.find((value) => value.startsWith("--expected-sha256="))?.slice("--expected-sha256=".length);
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !serviceRoleKey) fail("Supabase URL과 service role key가 필요합니다.");
  const [sourceBytes, database] = await Promise.all([readRosterBytes(path), loadDatabaseContext(supabaseUrl, serviceRoleKey)]);
  const result = await runRosterReset({ path: "members/members.csv", source: sourceBytes.toString("utf8"), sourceBytes, ...database, execute, confirmation, expectedSha256, serviceRoleKey });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "회원 명부 초기화가 실패했습니다.");
    process.exitCode = 1;
  });
}
