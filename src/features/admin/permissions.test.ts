import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROLE_PERMISSIONS,
  hasPermission,
  type Permission,
  type RoleName,
} from "./permissions";

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
});
