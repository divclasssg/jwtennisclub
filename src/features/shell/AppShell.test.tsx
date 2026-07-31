import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
    [key: string]: unknown;
  }) => (
    <a className={className} href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/members",
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
  { href: "/settlements", label: "결산" },
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
    expect(screen.getAllByText("관리자 · 부총무")).toHaveLength(2);
    const mobileHeader = screen.getByRole("banner", {
      name: "모바일 앱 헤더",
    });
    const accountMenu = within(mobileHeader).getByRole("button", {
      name: "계정 메뉴",
    });
    expect(accountMenu.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("menu.png"),
    );
    expect(screen.getAllByRole("link", { name: "비밀번호 변경" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "로그아웃" })).toHaveLength(2);
    const nav = screen.getByLabelText("주요 메뉴");

    for (const brandLink of screen.getAllByRole("link", {
      name: "JW TENNIS CLUB",
    })) {
      expect(brandLink).toHaveAttribute("href", "/dashboard");
    }

    for (const item of requiredNavigationItems) {
      expect(within(nav).getByRole("link", { name: item.label })).toHaveAttribute(
        "href",
        item.href,
      );
    }
    expect(within(nav).getByRole("link", { name: "회원" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    expect(
      within(nav).queryByRole("link", { name: "설정" }),
    ).not.toBeInTheDocument();
    expect(
      within(nav).queryByRole("link", { name: "PDF" }),
    ).not.toBeInTheDocument();
    for (const passwordLink of screen.getAllByRole("link", {
      name: "비밀번호 변경",
    })) {
      expect(passwordLink).toHaveAttribute("href", "/settings/password");
    }
    expect(screen.getByRole("heading", { name: "업무 화면" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "등록 모달" })).toHaveTextContent(
      "모달 내용",
    );
  });

  it("shows the meeting navigation only when the operator can view meetings", () => {
    const { rerender } = render(
      <AppShell showMeetings>
        <h1>정모 화면</h1>
      </AppShell>,
    );

    expect(
      within(screen.getByLabelText("주요 메뉴")).getByRole("link", {
        name: "정모",
      }),
    ).toHaveAttribute("href", "/meetings");

    rerender(
      <AppShell showMeetings={false}>
        <h1>일반 화면</h1>
      </AppShell>,
    );
    expect(
      within(screen.getByLabelText("주요 메뉴")).queryByRole("link", {
        name: "정모",
      }),
    ).not.toBeInTheDocument();
  });
});
