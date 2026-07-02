import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_ROLE_PERMISSIONS,
  hasPermission,
  PERMISSIONS,
  type Permission,
  type RoleName,
} from "./permissions";

const migrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/202607020001_foundation.sql"),
  "utf8",
);

function roleSeedSection(role: string): string {
  const match = migrationSql.match(
    new RegExp(
      String.raw`insert into public\.role_permissions[\s\S]*?where roles\.name = '${role}'[\s\S]*?on conflict \(role_id, permission\) do nothing;`,
      "m",
    ),
  );

  expect(match, `Missing ${role} role permission seed section`).not.toBeNull();
  return match?.[0] ?? "";
}

describe("hasPermission", () => {
  it("allows admins to manage roles", () => {
    expect(hasPermission("admin", "roles.manage")).toBe(true);
  });

  it("allows default operators to create payments and expenses", () => {
    expect(hasPermission("operator", "fees.payments.create")).toBe(true);
    expect(hasPermission("operator", "expenses.create")).toBe(true);
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
      const section = roleSeedSection(role);

      for (const permission of permissions) {
        expect(section).toContain(`('${permission}')`);
      }
    }
  });
});
