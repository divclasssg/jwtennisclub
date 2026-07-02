import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a className={className} href={href}>
      {children}
    </a>
  ),
}));

vi.mock("@/app/(auth)/login/actions", () => ({
  logout: vi.fn(),
}));

describe("AppShell", () => {
  it("renders the Korean primary navigation and logout action", () => {
    render(
      <AppShell>
        <h1>업무 화면</h1>
      </AppShell>,
    );

    expect(screen.getAllByText("JW Tennis Club").length).toBeGreaterThan(0);
    const nav = screen.getByLabelText("주요 메뉴");

    expect(within(nav).getByRole("link", { name: "대시보드" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(within(nav).getByRole("link", { name: "회원" })).toHaveAttribute(
      "href",
      "/members",
    );
    expect(within(nav).getByRole("link", { name: "PDF" })).toHaveAttribute(
      "href",
      "/reports",
    );
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "업무 화면" })).toBeInTheDocument();
  });
});
