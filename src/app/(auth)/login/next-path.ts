export const DEFAULT_LOGIN_NEXT = "/dashboard";
const LOGIN_NEXT_PARSE_ORIGIN = "https://jwtennisclub.local";

export type LoginSearchParam = string | string[] | undefined;

export function firstSearchParam(value: LoginSearchParam) {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeLoginNext(value: unknown) {
  const next = Array.isArray(value) ? value[0] : value;

  if (typeof next !== "string") {
    return DEFAULT_LOGIN_NEXT;
  }

  if (next === "" || !next.startsWith("/") || next.includes("\\")) {
    return DEFAULT_LOGIN_NEXT;
  }

  try {
    const url = new URL(next, LOGIN_NEXT_PARSE_ORIGIN);

    if (
      url.origin !== LOGIN_NEXT_PARSE_ORIGIN ||
      !url.pathname.startsWith("/")
    ) {
      return DEFAULT_LOGIN_NEXT;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_LOGIN_NEXT;
  }
}

export function buildLoginErrorRedirect(error: string, next: unknown) {
  const params = new URLSearchParams({
    error,
    next: normalizeLoginNext(next),
  });

  return `/login?${params.toString()}`;
}
