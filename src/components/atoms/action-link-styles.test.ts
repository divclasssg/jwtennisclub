import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const actionLinkStyles = readFileSync(
  join(process.cwd(), "src/components/atoms/ActionLink.module.scss"),
  "utf8",
);

describe("ActionLink styles", () => {
  it("keeps primary link text visible inside table link rules", () => {
    expect(actionLinkStyles).toMatch(
      /\.action-link\.primary\s*{[\s\S]*?color:\s*var\(--on-primary\);/,
    );
  });
});
