import { redirect } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import ReportsPage from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("ReportsPage", () => {
  it("redirects to the settlement page for the selected month", async () => {
    await ReportsPage({
      searchParams: Promise.resolve({ month: "2026-06" }),
    });

    expect(redirect).toHaveBeenCalledWith("/settlements?month=2026-06");
  });
});
