import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("fee note summary styles", () => {
  it("caps the desktop summary width so long notes ellipsize", () => {
    const globals = readSource("src/app/globals.scss");
    const pageStyles = readSource("src/app/(app)/fees/page.module.scss");

    expect(globals).toContain("--fees-note-summary-max-width:");
    expect(pageStyles).toMatch(
      /\.fees-note-summary\s*\{[\s\S]*max-width:\s*var\(--fees-note-summary-max-width\)/,
    );
  });
});
