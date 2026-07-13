import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("@/lib/env", () => ({
  getPublicEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  }),
}));

import { updateSession } from "./proxy";

describe("updateSession", () => {
  beforeEach(() => {
    mocks.getClaims.mockReset();
    mocks.getUser.mockReset();
    mocks.createServerClient.mockReturnValue({
      auth: { getClaims: mocks.getClaims, getUser: mocks.getUser },
    });
  });

  it("uses verified JWT claims without a remote getUser request", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "operator-id" } },
      error: null,
    });

    const result = await updateSession(new NextRequest("https://club.example/members"));

    expect(result.userId).toBe("operator-id");
    expect(mocks.getClaims).toHaveBeenCalledTimes(1);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("fails closed when claims cannot be verified", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: new Error("invalid") });

    await expect(updateSession(new NextRequest("https://club.example/members")))
      .resolves.toMatchObject({ userId: null });
  });
});
