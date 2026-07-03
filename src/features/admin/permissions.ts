export const PERMISSIONS = [
  "members.view",
  "members.create",
  "members.update",
  "members.delete",
  "fees.payments.create",
  "fees.payments.update",
  "expenses.view",
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
export type DefaultRoleName = "admin" | "operator";
export type RoleName = DefaultRoleName | (string & {});

export type RolePermissionMap = Readonly<
  Record<string, readonly Permission[] | undefined>
>;

export const DEFAULT_ROLE_PERMISSIONS: Readonly<
  Record<DefaultRoleName, readonly Permission[]>
> = Object.freeze({
  admin: Object.freeze([...PERMISSIONS]),
  operator: Object.freeze([
    "members.view",
    "fees.payments.create",
    "expenses.view",
    "expenses.create",
    "events.create",
  ] as const),
});

export function hasPermission(
  role: RoleName,
  permission: Permission,
  permissionMap: RolePermissionMap = DEFAULT_ROLE_PERMISSIONS,
): boolean {
  return permissionMap[role]?.includes(permission) ?? false;
}
