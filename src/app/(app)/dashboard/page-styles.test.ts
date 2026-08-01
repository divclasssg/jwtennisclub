import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pageStyles = readFileSync(
  join(process.cwd(), "src/app/(app)/dashboard/page.module.scss"),
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
});
