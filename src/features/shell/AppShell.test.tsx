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

const requiredNavigationItems = [
  { href: "/dashboard", label: "홈" },
  { href: "/members", label: "회원" },
  { href: "/fees", label: "회비" },
  { href: "/expenses", label: "지출" },
  { href: "/schedule", label: "일정" },
  { href: "/settlements", label: "정산" },
];

describe("AppShell", () => {
  it("renders the Korean primary navigation and logout action", () => {
    render(
      <AppShell
        modal={<aside aria-label="등록 모달">모달 내용</aside>}
        userDisplayName="박세익"
        userPositionLabel="부총무"
        userRoleLabel="관리자"
      >
        <h1>업무 화면</h1>
      </AppShell>,
    );

    expect(screen.getAllByText("박세익").length).toBeGreaterThan(0);
    expect(screen.getByText("관리자 · 부총무")).toBeInTheDocument();
    const nav = screen.getByLabelText("주요 메뉴");

    for (const item of requiredNavigationItems) {
      expect(within(nav).getByRole("link", { name: item.label })).toHaveAttribute(
        "href",
        item.href,
      );
    }

    expect(
      within(nav).queryByRole("link", { name: "설정" }),
    ).not.toBeInTheDocument();
    expect(
      within(nav).queryByRole("link", { name: "PDF" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "비밀번호 변경" })).toHaveAttribute(
      "href",
      "/settings/password",
    );
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "업무 화면" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "등록 모달" })).toHaveTextContent(
      "모달 내용",
    );
  });
});
