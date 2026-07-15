import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  join(process.cwd(), "src/app/(app)/meetings/page.tsx"),
  "utf8",
);

describe("meetings page module contract", () => {
  it("does not expose helper functions as Next.js page exports", () => {
    expect(pageSource).not.toContain(
      "export function canonicalizeScheduleReturnTo",
    );
  });
});
