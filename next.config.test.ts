import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("Next output tracing", () => {
  it("includes only the server-side monthly report font for the PDF route", () => {
    expect(nextConfig.outputFileTracingIncludes).toEqual({
      "/reports/monthly": [
        "src/features/reports/fonts/IBMPlexSansKR-Regular.ttf",
      ],
    });
  });
});
