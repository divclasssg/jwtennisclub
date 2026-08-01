import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DashboardTrendPoint } from "./dashboard-page";
import {
  createLinearScale,
  formatChartMonth,
  LedgerBalanceChart,
  MonthlyCashFlowChart,
} from "./FinancialCharts";

const currentPoint: DashboardTrendPoint = {
  periodMonth: "2026-08-01",
  source: "current",
  actualFeeIncome: 510_000,
  expenseTotal: 130_000,
  closingLedgerBalance: 775_000,
};

const finalPoint: DashboardTrendPoint = {
  periodMonth: "2026-07-01",
  source: "final",
  actualFeeIncome: 600_000,
  expenseTotal: 205_000,
  closingLedgerBalance: 395_000,
};

describe("finance chart geometry", () => {
  it("maps an all-zero domain to the stable chart baseline", () => {
    expect(createLinearScale([0], 32, 208)(0)).toBe(208);
  });

  it("maps negative and positive domain bounds to the chart range", () => {
    const scale = createLinearScale([-100_000, 200_000], 32, 208);

    expect(scale(-100_000)).toBe(208);
    expect(scale(200_000)).toBe(32);
  });

  it("keeps empty and equal nonzero domains finite", () => {
    expect(Number.isFinite(createLinearScale([], 32, 208)(500))).toBe(true);
    expect(Number.isFinite(createLinearScale([125_000], 32, 208)(125_000))).toBe(true);
  });

  it("formats a chart period as a Korean month label", () => {
    expect(formatChartMonth("2026-08-01")).toBe("8월");
  });
});

describe("finance chart semantics", () => {
  it("renders current cash flow and balance as accessible, provisional charts", () => {
    render(
      <>
        <MonthlyCashFlowChart points={[currentPoint]} />
        <LedgerBalanceChart points={[currentPoint]} />
      </>,
    );

    expect(screen.getByRole("heading", { name: "월별 수납·지출" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "장부 잔액 추이" })).toBeInTheDocument();
    expect(screen.getAllByText("최근 6개월")).toHaveLength(2);
    expect(screen.getAllByText("8월").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("실제 회비 수납액").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("운영 지출").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("현재 예상 잔액").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("변동 가능").length).toBeGreaterThanOrEqual(1);

    const cashTable = screen.getByRole("table", { name: "월별 수납 및 지출 수치" });
    expect(within(cashTable).getByText("510,000원")).toBeInTheDocument();
    expect(within(cashTable).getByText("130,000원")).toBeInTheDocument();

    const balanceTable = screen.getByRole("table", { name: "월별 장부 잔액 수치" });
    expect(within(balanceTable).getByText("775,000원")).toBeInTheDocument();

    for (const chart of screen.getAllByRole("img")) {
      expect(chart).toHaveAttribute("aria-labelledby");
      expect(chart).toHaveAttribute("aria-describedby");
    }
  });

  it("labels final-only balance data as confirmed without provisional copy", () => {
    render(<LedgerBalanceChart points={[finalPoint]} />);

    expect(screen.getAllByText("확정 잔액").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("현재 예상 잔액")).not.toBeInTheDocument();
    expect(screen.queryByText("변동 가능")).not.toBeInTheDocument();
  });

  it("does not connect balance points across a missing calendar month", () => {
    const { container } = render(
      <LedgerBalanceChart
        points={[
          finalPoint,
          {
            ...finalPoint,
            periodMonth: "2026-09-01",
            closingLedgerBalance: 450_000,
          },
        ]}
      />,
    );

    expect(container.querySelectorAll("line[data-balance-segment]")).toHaveLength(0);
    expect(container.querySelectorAll("circle[data-balance-marker]")).toHaveLength(2);
  });

  it("uses a dashed final segment and hollow marker for the current balance", () => {
    const { container } = render(
      <LedgerBalanceChart points={[finalPoint, currentPoint]} />,
    );

    const segment = container.querySelector("line[data-balance-segment]");
    const currentMarker = container.querySelector(
      'circle[data-balance-marker][data-source="current"]',
    );

    expect(segment).toHaveAttribute("stroke-dasharray");
    expect(currentMarker).toHaveAttribute("fill", "var(--canvas)");
  });

  it("renders informative empty states instead of empty SVGs", () => {
    const { container } = render(
      <>
        <MonthlyCashFlowChart points={[]} />
        <LedgerBalanceChart points={[]} />
      </>,
    );

    expect(screen.getByText("표시할 재무 흐름이 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("표시할 장부 잔액 추이가 없습니다.")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });
});
