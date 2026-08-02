import { Suspense } from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "@/features/shell/AppShell";

import DashboardError from "./error";
import DashboardLayout from "./layout";
import DashboardLoading from "./loading";
import DashboardPage from "./page";

const dashboardDataMocks = vi.hoisted(() => ({
  loadDashboardPage: vi.fn(),
}));

vi.mock("@/features/dashboard/dashboard-data", () => ({
  loadDashboardPage: dashboardDataMocks.loadDashboardPage,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

vi.mock("@/app/(auth)/login/actions", () => ({
  logout: vi.fn(),
}));

function expectDashboardFrame(child: React.ReactNode) {
  render(
    <AppShell userDisplayName="테스트 운영자">
      <DashboardLayout>{child}</DashboardLayout>
    </AppShell>,
  );

  const shellContent = screen.getByRole("main");
  const shellWorkspace = shellContent.parentElement;

  expect(shellWorkspace).not.toBeNull();
  const dashboardTitle = within(shellWorkspace as HTMLElement).getByRole("heading", {
    name: "홈",
    level: 1,
  });

  expect(dashboardTitle).toHaveAttribute("data-hide-shell-title-bar", "true");
  expect(dashboardTitle.className).toContain("dashboard-page-title");
  expect(shellContent).toContainElement(dashboardTitle);
}

describe("DashboardLayout", () => {
  it("keeps title suppression in the shell workspace after a successful load", () => {
    expectDashboardFrame(<p>대시보드 내용</p>);

    expect(screen.getByText("대시보드 내용")).toBeInTheDocument();
  });

  it("keeps title suppression in the shell workspace while the dashboard load is pending", () => {
    dashboardDataMocks.loadDashboardPage.mockReturnValue(new Promise(() => undefined));

    expectDashboardFrame(
      <Suspense fallback={<DashboardLoading />}>
        {DashboardPage()}
      </Suspense>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("페이지를 불러오는 중입니다");
  });

  it("keeps title suppression in the shell workspace when the dashboard load throws", async () => {
    const loadError = new Error("private database connection detail");
    dashboardDataMocks.loadDashboardPage.mockRejectedValue(loadError);

    await expect(DashboardPage()).rejects.toBe(loadError);

    expectDashboardFrame(
      <DashboardError
        error={loadError}
        unstable_retry={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "대시보드를 불러오지 못했습니다",
      }),
    ).toBeInTheDocument();
  });
});
