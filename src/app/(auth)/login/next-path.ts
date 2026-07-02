export const DEFAULT_LOGIN_NEXT = "/dashboard";

export type LoginSearchParam = string | string[] | undefined;

export function firstSearchParam(value: LoginSearchParam) {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeLoginNext(value: unknown) {
  const next = Array.isArray(value) ? value[0] : value;

  if (typeof next !== "string") {
    return DEFAULT_LOGIN_NEXT;
  }

  if (next === "" || !next.startsWith("/") || next.startsWith("//")) {
    return DEFAULT_LOGIN_NEXT;
  }

  return next;
}

export function buildLoginErrorRedirect(error: string, next: unknown) {
  const params = new URLSearchParams({
    error,
    next: normalizeLoginNext(next),
  });

  return `/login?${params.toString()}`;
}
