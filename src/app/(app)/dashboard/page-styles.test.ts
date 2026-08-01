import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pageStyles = readFileSync(
  join(process.cwd(), "src/app/(app)/dashboard/page.module.scss"),
  "utf8",
);

const chartStyles = readFileSync(
  join(process.cwd(), "src/features/dashboard/FinancialCharts.module.scss"),
  "utf8",
);

describe("dashboard metric dividers", () => {
  it("scopes current and latest-final divider rules to their own grids", () => {
    expect(pageStyles).toContain(
      ".dashboard-finance-metrics > .dashboard-finance-metric",
    );
    expect(pageStyles).toContain(
      ".dashboard-closing-metrics > .dashboard-finance-metric",
    );
  });

  it("keeps dashboard rows content-sized inside the scrolling page", () => {
    expect(pageStyles).toContain(
      ".dashboard-page {\n  display: grid;\n  align-content: start;",
    );
    expect(pageStyles).toContain("grid-auto-rows: max-content;");
  });

  it("keeps compact two-column metrics at phone width", () => {
    expect(pageStyles).not.toContain(
      ".dashboard-finance-metrics,\n  .dashboard-closing-metrics {\n    grid-template-columns: minmax(0, 1fr);",
    );
    expect(pageStyles).toContain(
      ".dashboard-closing-metrics > .dashboard-finance-metric {\n    border-bottom: var(--hairline-width) solid var(--hairline);",
    );
  });

  it("uses line-based dashboard surfaces without rounded cards", () => {
    expect(pageStyles).not.toContain(
      ".dashboard-member-card,\n.dashboard-balance-card,\n.dashboard-current-finance,\n.dashboard-closing-card,\n.dashboard-empty-state {\n  border:",
    );
    expect(pageStyles).not.toMatch(
      /\.dashboard-balance-card[\s\S]*?background: var\(--surface-black\)/,
    );
    expect(pageStyles).toContain(
      "border-bottom: var(--hairline-width) solid var(--hairline);",
    );
    expect(pageStyles).not.toContain("border-radius: var(--rounded-lg);");
    expect(chartStyles).not.toContain("border-radius: var(--rounded-lg);");
    expect(chartStyles).toContain(
      "border-right: var(--hairline-width) solid var(--hairline);",
    );
  });
});
