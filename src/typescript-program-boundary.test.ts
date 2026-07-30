import { dirname, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("Next TypeScript program boundary", () => {
  it("includes application code without claiming the Deno-only Task 8 tools", () => {
    const configPath = resolve("tsconfig.json");
    const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
    if (loaded.error) {
      throw new Error(
        ts.flattenDiagnosticMessageText(loaded.error.messageText, "\n"),
      );
    }

    const parsed = ts.parseJsonConfigFileContent(
      loaded.config,
      ts.sys,
      dirname(configPath),
    );
    const rootFiles = parsed.fileNames.map((file) =>
      relative(process.cwd(), file).split(sep).join("/"),
    );

    expect(rootFiles).toContain("src/app/page.tsx");
    expect(
      rootFiles.some((file) => file.startsWith("supabase/scripts/task8/")),
    ).toBe(false);
  });
});
