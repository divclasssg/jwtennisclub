import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Vercel runtime region", () => {
  it("runs server functions in Seoul next to Supabase", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));

    expect(config.regions).toEqual(["icn1"]);
  });
});
