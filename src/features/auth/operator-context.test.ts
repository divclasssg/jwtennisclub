import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => {
      let result: ReturnType<T> | undefined;
      return ((...args: Parameters<T>) => {
        result ??= fn(...args) as ReturnType<T>;
        return result;
      }) as T;
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));

describe("operator context", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.rpc.mockReset();
  });

  it("normalizes and memoizes the current operator RPC in one request", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        id: "operator-id",
        display_name: "관리자",
        email: "admin@example.com",
        role_label: "관리자",
        position_label: "회장",
        permissions: ["members.create", "members.update"],
      },
      error: null,
    });
    const { loadCurrentOperatorContext, currentOperatorHasPermission } = await import("./operator-context");

    await expect(loadCurrentOperatorContext()).resolves.toEqual({
      id: "operator-id",
      displayName: "관리자",
      email: "admin@example.com",
      roleLabel: "관리자",
      positionLabel: "회장",
      permissions: ["members.create", "members.update"],
    });
    await expect(currentOperatorHasPermission("members.update")).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("get_current_operator_context");
  });

  it("fails closed when the RPC returns no active operator", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const { loadCurrentOperatorContext, currentOperatorHasPermission } = await import("./operator-context");

    await expect(loadCurrentOperatorContext()).resolves.toBeNull();
    await expect(currentOperatorHasPermission("members.create")).resolves.toBe(false);
  });

  it("throws a stable error when the context query fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("network") });
    const { loadCurrentOperatorContext } = await import("./operator-context");

    await expect(loadCurrentOperatorContext()).rejects.toThrow("운영자 정보를 불러오지 못했습니다.");
  });
});
