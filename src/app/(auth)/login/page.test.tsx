import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LoginPage from "./page";

vi.mock("./actions", () => ({
  login: vi.fn(),
}));

describe("LoginPage", () => {
  it("uses the Foundation brand heading", async () => {
    const page = await LoginPage({ searchParams: Promise.resolve({}) });

    render(page);

    expect(
      screen.getByRole("heading", { name: "JW TENNIS CLUB" }),
    ).toBeInTheDocument();
  });
});
