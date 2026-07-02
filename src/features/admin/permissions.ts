export const PERMISSIONS = [
  "members.view",
  "members.create",
  "members.update",
  "members.delete",
  "fees.payments.create",
  "fees.payments.update",
  "expenses.create",
  "expenses.update",
  "expenses.delete",
  "events.create",
  "events.update",
  "settlements.close",
  "settlements.reopen",
  "operators.manage",
  "roles.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type RoleName = "admin" | "operator";

export type RolePermissionMap = Record<RoleName, Permission[]>;

export const DEFAULT_ROLE_PERMISSIONS: RolePermissionMap = {
  admin: [...PERMISSIONS],
  operator: [
    "members.view",
    "fees.payments.create",
    "expenses.create",
    "events.create",
  ],
};

export function hasPermission(
  role: RoleName,
  permission: Permission,
  permissionMap: RolePermissionMap = DEFAULT_ROLE_PERMISSIONS,
): boolean {
  return permissionMap[role].includes(permission);
}
