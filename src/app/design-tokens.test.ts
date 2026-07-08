import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const globals = readFileSync(join(process.cwd(), "src/app/globals.scss"), "utf8");

describe("design tokens", () => {
  it("maps Figma text styles to their exported font sizes", () => {
    expect(globals).toContain("--text-heading-size: 11px;");
    expect(globals).toContain("--text-title-size: 17px;");
    expect(globals).toContain("--text-body-size: 13px;");
    expect(globals).toContain("--text-caption-size: 11px;");
    expect(globals).toContain("--text-button-utility-size: 13px;");
  });

  it("maps Figma text styles to their exported font weights", () => {
    expect(globals).toContain("--font-weight-regular: 400;");
    expect(globals).toContain("--font-weight-medium: 500;");
    expect(globals).toContain("--font-weight-bold: 700;");
    expect(globals).toContain("--text-heading-weight: var(--font-weight-bold);");
    expect(globals).toContain("--text-title-weight: var(--font-weight-bold);");
    expect(globals).toContain("--text-body-weight: var(--font-weight-medium);");
    expect(globals).toContain(
      "--text-caption-weight: var(--font-weight-regular);",
    );
    expect(globals).toContain(
      "--text-button-utility-weight: var(--font-weight-medium);",
    );
  });
});
