import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("shared match integration preflight", () => {
  it("runs the local database preflight against the applied schema", () => {
    const output = execFileSync(
      "supabase",
      ["test", "db", "supabase/tests/match_preflight.test.sql"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          SUPABASE_TELEMETRY_DISABLED: "1",
        },
      },
    );

    expect(output).toContain("ok");
  });
});
