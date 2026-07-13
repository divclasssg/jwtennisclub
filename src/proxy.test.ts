import {
  getRedirectUrl,
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateSession } from "@/lib/supabase/proxy";
import { config, proxy } from "./proxy";

vi.mock("@/lib/supabase/proxy", () => ({
  updateSession: vi.fn(),
}));

const mockedUpdateSession = vi.mocked(updateSession);

describe("proxy", () => {
  beforeEach(() => {
    mockedUpdateSession.mockReset();
  });

  it("matches protected app routes and skips static assets", () => {
    expect(unstable_doesMiddlewareMatch({ config, url: "/dashboard" })).toBe(
      true,
    );
    expect(unstable_doesMiddlewareMatch({ config, url: "/members/active" })).toBe(
      true,
    );
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: "/_next/static/chunks/app.js",
      }),
    ).toBe(false);
  });

  it("redirects unauthenticated protected requests to login with next path", async () => {
    mockedUpdateSession.mockResolvedValue({
      response: NextResponse.next(),
      userId: null,
    });

    const response = await proxy(
      new NextRequest("https://club.example/dashboard?tab=fees"),
    );

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response)).toBe(
      "https://club.example/login?next=%2Fdashboard%3Ftab%3Dfees",
    );
  });

  it("redirects authenticated login requests to the dashboard", async () => {
    mockedUpdateSession.mockResolvedValue({
      response: NextResponse.next(),
      userId: "operator-id",
    });

    const response = await proxy(new NextRequest("https://club.example/login"));

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response)).toBe("https://club.example/dashboard");
  });
});
