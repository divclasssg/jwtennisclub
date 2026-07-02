import { describe, expect, it, vi } from "vitest";
import Home from "./page";

const redirect = vi.fn();
const redirectError = new Error("NEXT_REDIRECT");

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    redirect(path);
    throw redirectError;
  },
}));

describe("Home", () => {
  it("redirects operators to the dashboard", () => {
    expect(() => Home()).toThrow(redirectError);

    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
