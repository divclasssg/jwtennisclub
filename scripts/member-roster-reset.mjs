import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const REQUIRED_HEADERS = ["ID", "이름", "전화번호", "Group", "상태", "가입일"];
const STATUS_MAP = new Map([
  ["활동중", "active"],
  ["활동", "active"],
  ["active", "active"],
  ["휴회", "paused"],
  ["paused", "paused"],
  ["탈퇴", "withdrawn"],
  ["withdrawn", "withdrawn"],
]);

function fail(message, rowNumber) {
  throw new Error(rowNumber ? `CSV ${rowNumber}행: ${message}` : message);
}

function parseCsvRecords(source) {
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field === "") {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      record.push(field);
      if (record.some((value) => value !== "")) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) fail("닫히지 않은 따옴표가 있습니다.");
  record.push(field);
  if (record.some((value) => value !== "")) records.push(record);
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

  const headers = records[0].map((header) => header.trim());
  if (new Set(headers).size !== headers.length) fail("중복 헤더가 있습니다.");
  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(required)) fail(`필수 헤더가 없습니다: ${required}`);
  }

  const rows = [];
  const memberCodes = new Set();
  const namePhones = new Set();
  let memberCodePrefix;

  for (let index = 1; index < records.length; index += 1) {
    const record = records[index];
    const rowNumber = index + 1;
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
  const sha256 = createHash("sha256").update(options.source).digest("hex");
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
  const path = argv.find((argument) => !argument.startsWith("--"));
  if (!path) fail("CSV 경로가 필요합니다.");
  if (path !== "members/members.csv") fail("입력 경로는 정확히 members/members.csv여야 합니다.");
  const execute = argv.includes("--execute");
  const confirmation = argv.find((value) => value.startsWith("--confirm="))?.slice("--confirm=".length);
  const expectedSha256 = argv.find((value) => value.startsWith("--expected-sha256="))?.slice("--expected-sha256=".length);
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !serviceRoleKey) fail("Supabase URL과 service role key가 필요합니다.");
  const [source, database] = await Promise.all([readFile(path, "utf8"), loadDatabaseContext(supabaseUrl, serviceRoleKey)]);
  const result = await runRosterReset({ path, source, ...database, execute, confirmation, expectedSha256, serviceRoleKey });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "회원 명부 초기화가 실패했습니다.");
    process.exitCode = 1;
  });
}
