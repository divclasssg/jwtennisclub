export function normalizePhoneNumber(
  value: string | null | undefined,
): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits || null;
}

export function validatePhoneNumber(value: string | null): string[] {
  return value && !/^01[016789][0-9]{7,8}$/.test(value)
    ? ["연락처를 올바른 휴대전화 번호로 입력하세요."]
    : [];
}

export function maskPhoneNumber(value: string | null): string {
  if (!value) {
    return "연락처 없음";
  }

  return `${value.slice(0, 3)}-****-${value.slice(-4)}`;
}
