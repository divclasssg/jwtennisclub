import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AppLayout from "./layout";

vi.mock("@/features/auth/operator-context", () => ({
  loadCurrentOperatorContext: vi.fn(async () => ({
    id: "operator-id",
    displayName: "박세익",
    email: "operator@example.com",
    roleLabel: "운영진",
    positionLabel: "총무",
    permissions: [],
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    throw new Error("layout should use cached operator context");
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/members",
}));

describe("AppLayout", () => {
  it("renders shell identity from the shared operator context", async () => {
    render(await AppLayout({ children: <p>내용</p> }));

    expect(screen.getAllByText("박세익")).toHaveLength(2);
    expect(screen.getByText("운영진 · 총무")).toBeInTheDocument();
    expect(screen.getByText("내용")).toBeInTheDocument();
  });
});
