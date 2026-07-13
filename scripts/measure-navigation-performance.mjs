import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (path) => existsSync(path) ? readFileSync(path, "utf8") : "";
const count = (source, pattern) => source.match(pattern)?.length ?? 0;

const memberPage = read("src/app/(app)/members/page.tsx");
const memberDirectory = read("src/features/members/member-directory.ts");
const proxySource = read("src/lib/supabase/proxy.ts");

function estimateMemberPageCalls() {
  if (
    memberPage.includes("loadMemberDirectoryPage") ||
    memberDirectory.includes('rpc("get_member_directory_page"')
  ) {
    return 1;
  }

  const pagePermissionChecks = count(memberPage, /hasCurrentUserPermission\(/g);
  const directoryUsesPermissionChain = memberDirectory.includes(
    "canManageMemberContacts(supabase)",
  );
  const directoryDataCalls = 3; // members, one contact branch, operator positions

  return (
    pagePermissionChecks * 3 +
    (directoryUsesPermissionChain ? 3 : 0) +
    directoryDataCalls
  );
}

function readVercelRegion() {
  try {
    const config = JSON.parse(read("vercel.json"));
    return Array.isArray(config.regions) &&
      config.regions.length === 1 &&
      config.regions[0] === "icn1"
      ? 1
      : 0;
  } catch {
    return 0;
  }
}

const tests = spawnSync("npm", ["run", "test"], {
  cwd: process.cwd(),
  encoding: "utf8",
});
const testOutput = `${tests.stdout ?? ""}\n${tests.stderr ?? ""}`;
const testCount = Number(testOutput.match(/Tests\s+(\d+) passed/)?.[1] ?? 0);

const metrics = {
  member_page_supabase_calls: estimateMemberPageCalls(),
  required_tests_passed: tests.status === 0 ? 1 : 0,
  proxy_get_user_calls: count(proxySource, /auth\.getUser\(/g),
  proxy_get_claims_calls: count(proxySource, /auth\.getClaims\(/g),
  loading_boundary: existsSync("src/app/(app)/loading.tsx") ? 1 : 0,
  vercel_icn1: readVercelRegion(),
  full_test_count: testCount,
};

process.stdout.write(`${JSON.stringify(metrics)}\n`);
