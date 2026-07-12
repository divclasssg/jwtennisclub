import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_ROLE_PERMISSIONS,
  hasPermission,
  PERMISSIONS,
  type Permission,
  type RoleName,
} from "./permissions";

const migrationsDirectory = join(process.cwd(), "supabase/migrations");
const migrationSql = readdirSync(migrationsDirectory)
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort()
  .map((fileName) => readFileSync(join(migrationsDirectory, fileName), "utf8"))
  .join("\n");

function roleSeedSections(role: string): string[] {
  const matches = migrationSql.matchAll(
    /insert into public\.role_permissions[\s\S]*?on conflict \(role_id, permission\) do nothing;/gm,
  );
  const sections = [...matches]
    .map((match) => match[0])
    .filter(
      (section) =>
        section.includes(`where roles.name = '${role}'`) ||
        new RegExp(String.raw`where roles\.name in \([^)]*'${role}'`).test(section),
    );

  expect(sections, `Missing ${role} role permission seed section`).not.toHaveLength(0);
  return sections;
}

describe("hasPermission", () => {
  it("allows admins to manage roles", () => {
    expect(hasPermission("admin", "roles.manage")).toBe(true);
  });

  it("연락처 관리 권한은 관리자에게만 기본 부여한다", () => {
    expect(hasPermission("admin", "members.contacts.manage")).toBe(true);
    expect(hasPermission("operator", "members.contacts.manage")).toBe(false);
  });

  it("allows default operators to create payments and expenses", () => {
    expect(hasPermission("operator", "fees.payments.create")).toBe(true);
    expect(hasPermission("operator", "expenses.create")).toBe(true);
  });

  it("allows operators to manage schedule events", () => {
    expect(hasPermission("operator", "events.view")).toBe(true);
    expect(hasPermission("operator", "events.create")).toBe(true);
    expect(hasPermission("operator", "events.update")).toBe(true);
    expect(hasPermission("operator", "events.delete")).toBe(true);
  });

  it("blocks default operators from destructive admin actions", () => {
    expect(hasPermission("operator", "members.delete")).toBe(false);
    expect(hasPermission("operator", "expenses.delete")).toBe(false);
    expect(hasPermission("operator", "settlements.reopen")).toBe(false);
    expect(hasPermission("operator", "roles.manage")).toBe(false);
  });

  it("supports custom role permission bundles", () => {
    const role: RoleName = "operator";
    const permission: Permission = "settlements.close";

    expect(
      hasPermission(role, permission, {
        ...DEFAULT_ROLE_PERMISSIONS,
        operator: [...DEFAULT_ROLE_PERMISSIONS.operator, "settlements.close"],
      }),
    ).toBe(true);
  });

  it("fails closed when a custom role is missing from the permission map", () => {
    const role: RoleName = "auditor";

    expect(hasPermission(role, "members.view", {})).toBe(false);
  });
});

describe("DEFAULT_ROLE_PERMISSIONS", () => {
  it("protects default role permission arrays from runtime mutation", () => {
    const originalPermissions = [...DEFAULT_ROLE_PERMISSIONS.operator];

    try {
      (DEFAULT_ROLE_PERMISSIONS.operator as Permission[]).push("roles.manage");
    } catch {
      // Frozen arrays throw in strict mode; non-throwing runtimes must still not mutate.
    }

    expect(DEFAULT_ROLE_PERMISSIONS.operator).toEqual(originalPermissions);
    expect(hasPermission("operator", "roles.manage")).toBe(false);
  });

  it("stays aligned with foundation SQL permission seeds", () => {
    for (const permission of PERMISSIONS) {
      expect(migrationSql).toContain(`('${permission}')`);
    }

    for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      const sections = roleSeedSections(role);

      for (const permission of permissions) {
        expect(
          sections.some((section) => section.includes(`('${permission}')`)),
        ).toBe(true);
      }
    }
  });
});
