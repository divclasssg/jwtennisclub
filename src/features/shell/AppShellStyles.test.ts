import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(
  join(process.cwd(), "src/features/shell/AppShell.module.scss"),
  "utf8",
);

describe("dashboard shell title visibility", () => {
  it("collapses the title row only when dashboard publishes its marker", () => {
    expect(styles).toContain(
      '.shell-workspace:has([data-hide-shell-title-bar="true"])',
    );
    expect(styles).toMatch(
      /> \.shell-title-bar \{\s*display: none;/,
    );
    expect(styles).toMatch(
      /@media \(max-width: bp\.\$breakpoint-phone\)[\s\S]*?\.shell-workspace:has\(\[data-hide-shell-title-bar="true"\]\)[\s\S]*?grid-template-rows: minmax\(0, 1fr\)/,
    );
  });
});
