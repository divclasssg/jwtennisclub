import { cache } from "react";
import { PERMISSIONS, type Permission } from "@/features/admin/permissions";
import { createClient } from "@/lib/supabase/server";

export type OperatorContext = {
  id: string;
  displayName: string;
  email: string;
  roleLabel: string;
  positionLabel: string | null;
  permissions: Permission[];
};

type OperatorContextRpcRow = {
  id?: unknown;
  display_name?: unknown;
  email?: unknown;
  role_label?: unknown;
  position_label?: unknown;
  permissions?: unknown;
};

function isPermission(value: unknown): value is Permission {
  return typeof value === "string" &&
    (PERMISSIONS as readonly string[]).includes(value);
}

function mapOperatorContext(value: unknown): OperatorContext | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as OperatorContextRpcRow;
  if (
    typeof row.id !== "string" ||
    typeof row.display_name !== "string" ||
    typeof row.email !== "string" ||
    typeof row.role_label !== "string"
  ) {
    return null;
  }

  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    roleLabel: row.role_label,
    positionLabel: typeof row.position_label === "string"
      ? row.position_label
      : null,
    permissions: Array.isArray(row.permissions)
      ? row.permissions.filter(isPermission)
      : [],
  };
}

export const loadCurrentOperatorContext = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_current_operator_context");

  if (error) {
    throw new Error("운영자 정보를 불러오지 못했습니다.");
  }

  return mapOperatorContext(data);
});

export async function currentOperatorHasPermission(permission: Permission) {
  const context = await loadCurrentOperatorContext();
  return context?.permissions.includes(permission) ?? false;
}
