import { describe, expect, it, vi } from "vitest";
import Home from "./page";

const redirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
}));

describe("Home", () => {
  it("redirects operators to the dashboard", () => {
    Home();

    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
