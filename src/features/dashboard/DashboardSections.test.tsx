import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type {
  DashboardCurrentFinance,
  DashboardFinalClosingSummary,
  DashboardPageData,
} from "./dashboard-page";
import {
  CurrentMonthFinance,
  DashboardOverview,
  LatestFinalClosing,
} from "./DashboardSections";

const latestFinal: DashboardFinalClosingSummary = {
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
};

const openFinance: Extract<DashboardCurrentFinance, { status: "available" }> = {
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
  latestInterim: null,
};

const openDashboard: DashboardPageData = {
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
  currentFinance: openFinance,
  latestFinal,
  trends: [],
};

describe("DashboardOverview", () => {
  it("shows current member and open-ledger values with a provisional warning", () => {
    render(<DashboardOverview data={openDashboard} />);

    const overview = screen.getByRole("region", { name: "클럽 요약" });

    expect(within(overview).getByText("활동 회원")).toBeInTheDocument();
    expect(within(overview).getByText("20명")).toBeInTheDocument();
    expect(within(overview).getByText("활동 예정 1 · 휴회 2")).toBeInTheDocument();
    expect(
      within(overview).getByText("이번 달 신규 1 · 휴회 1 · 탈퇴 0"),
    ).toBeInTheDocument();
    expect(within(overview).getByText("현재 장부 잔액")).toBeInTheDocument();
    expect(within(overview).getByText("640,000원")).toBeInTheDocument();
    expect(within(overview).getByText("2026.08.01 09:30 기준")).toBeInTheDocument();
    expect(within(overview).getByText("최종 마감 전 변동 가능")).toBeInTheDocument();
  });

  it("omits the provisional warning when current finance is finalized", () => {
    render(
      <DashboardOverview
        data={{
          ...openDashboard,
          currentFinance: {
            ...openFinance,
            source: "final",
            activeFinal: {
              id: "22222222-2222-4222-8222-222222222222",
              closingKind: "final",
              version: 1,
              status: "closed",
            },
          },
        }}
      />,
    );

    expect(screen.queryByText("최종 마감 전 변동 가능")).not.toBeInTheDocument();
  });
});

describe("CurrentMonthFinance", () => {
  it("shows all available monthly metrics and the settlement link", () => {
    render(
      <CurrentMonthFinance
        finance={openDashboard.currentFinance}
        periodMonth={openDashboard.periodMonth}
      />,
    );

    const section = screen.getByRole("region", { name: "이번 달 재무 현황" });

    expect(within(section).getByText("완납 18 / 20명")).toBeInTheDocument();
    expect(within(section).getByText("미결산")).toBeInTheDocument();
    expect(within(section).getByText("60,000원")).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "월별 결산 보기" })).toHaveAttribute(
      "href",
      "/settlements?month=2026-08",
    );
  });

  it.each([
    [
      "member-activity-start-required" as const,
      "활동 시작 월이 확인되지 않은 회원이 있어 재무를 계산할 수 없습니다.",
    ],
    [
      "prior-final-closing-required" as const,
      "직전 월 최종 마감이 필요해 재무를 계산할 수 없습니다.",
    ],
    [
      "invalid-public-expense-description" as const,
      "공개 지출 설명을 확인해야 재무를 계산할 수 없습니다.",
    ],
  ])("maps %s to an actionable blocked explanation", (blockedReason, explanation) => {
    const blockedFinance = {
      status: "blocked" as const,
      blockedReason,
      source: null,
      summary: null,
      activeFinal: null,
      latestInterim: null,
    };

    render(
      <>
        <DashboardOverview
          data={{ ...openDashboard, currentFinance: blockedFinance }}
        />
        <CurrentMonthFinance
          finance={blockedFinance}
          periodMonth={openDashboard.periodMonth}
        />
      </>,
    );

    expect(screen.getAllByText("계산 대기")).toHaveLength(2);
    expect(screen.getAllByText(explanation)).toHaveLength(2);
    expect(screen.getByText("20명")).toBeInTheDocument();
    expect(screen.queryByText("0원")).not.toBeInTheDocument();
  });
});

describe("LatestFinalClosing", () => {
  it("shows only the approved final summary and exact snapshot links", () => {
    render(<LatestFinalClosing closing={latestFinal} />);

    const section = screen.getByRole("region", { name: "최근 최종 마감" });

    expect(within(section).getByText("2026년 7월")).toBeInTheDocument();
    expect(within(section).getByText("최종 마감 v2")).toBeInTheDocument();
    expect(within(section).getByText("2026.08.01 마감")).toBeInTheDocument();
    expect(within(section).getByText("기초 잔액")).toBeInTheDocument();
    expect(within(section).getByText("0원")).toBeInTheDocument();
    expect(within(section).getByText("실제 수납")).toBeInTheDocument();
    expect(within(section).getByText("570,000원")).toBeInTheDocument();
    expect(within(section).getByText("운영 지출")).toBeInTheDocument();
    expect(within(section).getByText("250,000원")).toBeInTheDocument();
    expect(within(section).getByText("당월 수지")).toBeInTheDocument();
    expect(within(section).getByText("+320,000원")).toBeInTheDocument();
    expect(within(section).getByText("기말 잔액")).toBeInTheDocument();
    expect(within(section).getByText("320,000원")).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "결산 보기" })).toHaveAttribute(
      "href",
      "/settlements?month=2026-07",
    );
    expect(within(section).getByRole("link", { name: "PDF 보기" })).toHaveAttribute(
      "href",
      "/reports/monthly?snapshot=11111111-1111-4111-8111-111111111111",
    );
    expect(section).not.toHaveTextContent(/마감자|closedBy|closer/i);
  });

  it("states clearly when there is no final closing", () => {
    render(<LatestFinalClosing closing={null} />);

    expect(
      screen.getByText("아직 최종 마감된 결산이 없습니다"),
    ).toBeInTheDocument();
  });
});
