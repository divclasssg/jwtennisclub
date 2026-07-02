import { describe, expect, it } from "vitest";
import { buildLoginErrorRedirect, normalizeLoginNext } from "./next-path";

describe("normalizeLoginNext", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/members?tab=a", "/members?tab=a"],
    ["/members#top", "/members#top"],
  ])("keeps internal app path %s", (input, expected) => {
    expect(normalizeLoginNext(input)).toBe(expected);
  });

  it.each([
    ["//evil.example"],
    ["/\\\\evil.example"],
    ["/\\evil.example"],
    ["/members\\profile"],
    ["\\evil.example"],
    ["https://evil.example"],
    [""],
    ["members"],
    [undefined],
  ])("defaults unsafe next value %s", (input) => {
    expect(normalizeLoginNext(input)).toBe("/dashboard");
  });

  it("uses the first search param value when next is repeated", () => {
    expect(normalizeLoginNext(["/members", "/dashboard"])).toBe("/members");
  });
});

describe("buildLoginErrorRedirect", () => {
  it("preserves sanitized next paths with their own query strings", () => {
    expect(buildLoginErrorRedirect("invalid-credentials", "/members?tab=a")).toBe(
      "/login?error=invalid-credentials&next=%2Fmembers%3Ftab%3Da",
    );
  });

  it("defaults unsafe next paths before building the error redirect", () => {
    expect(buildLoginErrorRedirect("missing-fields", "//evil.example")).toBe(
      "/login?error=missing-fields&next=%2Fdashboard",
    );
  });
});
