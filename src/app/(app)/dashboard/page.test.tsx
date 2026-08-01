import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DashboardPageData } from "@/features/dashboard/dashboard-page";

const mocks = vi.hoisted(() => ({
  loadDashboardPage: vi.fn(),
}));

vi.mock("@/features/dashboard/dashboard-data", () => ({
  loadDashboardPage: mocks.loadDashboardPage,
}));

import DashboardPage from "./page";

const dashboard: DashboardPageData = {
  asOf: "2026-08-01T00:30:00+00:00",
  periodMonth: "2026-08-01",
  members: {
    activeCount: 20,
    upcomingCount: 1,
    pausedCount: 2,
    joinedThisMonthCount: 1,
    pausedThisMonthCount: 1,
    withdrawnThisMonthCount: 0,
  },
  currentFinance: {
    status: "available",
    blockedReason: null,
    source: "current",
    summary: {
      billedTotal: 600_000,
      actualFeeIncome: 540_000,
      expenseTotal: 220_000,
      attributedNet: 320_000,
      fullyPaidCount: 18,
      feeTargetCount: 20,
      unpaidCount: 2,
      unpaidTotal: 60_000,
      openingLedgerBalance: 320_000,
      closingLedgerBalance: 640_000,
    },
    activeFinal: null,
    latestInterim: {
      id: "22222222-2222-4222-8222-222222222222",
      closingKind: "interim",
      version: 1,
      status: "closed",
    },
  },
  latestFinal: {
    id: "11111111-1111-4111-8111-111111111111",
    closingKind: "final",
    version: 2,
    status: "closed",
    periodMonth: "2026-07-01",
    closedAt: "2026-07-31T15:15:00+00:00",
    billedTotal: 600_000,
    actualFeeIncome: 570_000,
    expenseTotal: 250_000,
    attributedNet: 320_000,
    fullyPaidCount: 19,
    feeTargetCount: 20,
    unpaidCount: 1,
    unpaidTotal: 30_000,
    openingLedgerBalance: 0,
    closingLedgerBalance: 320_000,
  },
  trends: [
    {
      periodMonth: "2026-07-01",
      source: "final",
      actualFeeIncome: 570_000,
      expenseTotal: 250_000,
      closingLedgerBalance: 320_000,
    },
    {
      periodMonth: "2026-08-01",
      source: "current",
      actualFeeIncome: 540_000,
      expenseTotal: 220_000,
      closingLedgerBalance: 640_000,
    },
  ],
};

describe("DashboardPage", () => {
  beforeEach(() => {
    mocks.loadDashboardPage.mockReset();
    mocks.loadDashboardPage.mockResolvedValue(dashboard);
  });

  it("loads one aggregate and composes the approved finance-led route in order", async () => {
    render(await DashboardPage());

    expect(mocks.loadDashboardPage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "홈", level: 1 })).toBeInTheDocument();

    const orderedHeadings = [
      screen.getByRole("heading", { name: "클럽 요약" }),
      screen.getByRole("heading", { name: "2026년 8월 재무 현황" }),
      screen.getByRole("heading", { name: "재무 추이" }),
      screen.getByRole("heading", { name: "최근 최종 마감" }),
    ];

    for (let index = 1; index < orderedHeadings.length; index += 1) {
      expect(
        orderedHeadings[index - 1].compareDocumentPosition(orderedHeadings[index]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }

    expect(screen.getByRole("heading", { name: "월별 수납·지출" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "장부 잔액 추이" })).toBeInTheDocument();
    expect(screen.getByText("중간 결산 v1 이후 변동 가능")).toBeInTheDocument();
  });

  it("removes the placeholder utilities and unrelated operating content", async () => {
    const { container } = render(await DashboardPage());

    expect(screen.queryByText("이번 달 클럽 운영 상태")).not.toBeInTheDocument();
    expect(screen.queryByText(/foundation 화면/)).not.toBeInTheDocument();
    expect(screen.queryByText("회비 수입")).not.toBeInTheDocument();
    expect(screen.queryByText("오늘 확인할 항목")).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/members"]')).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/reports"]')).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/meetings"]')).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/schedule"]')).not.toBeInTheDocument();
  });
});
