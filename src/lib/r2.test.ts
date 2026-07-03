import { describe, expect, it } from "vitest";
import { buildR2Endpoint, readR2Env } from "./r2";

describe("R2 environment helpers", () => {
  it("reads Cloudflare R2 private environment variables", () => {
    expect(
      readR2Env({
        CLOUDFLARE_R2_ACCESS_KEY_ID: "access-key",
        CLOUDFLARE_R2_ACCOUNT_ID: "account-id",
        CLOUDFLARE_R2_BUCKET: "receipts",
        CLOUDFLARE_R2_SECRET_ACCESS_KEY: "secret-key",
      }),
    ).toEqual({
      accessKeyId: "access-key",
      accountId: "account-id",
      bucket: "receipts",
      secretAccessKey: "secret-key",
    });
  });

  it("builds the S3-compatible R2 endpoint", () => {
    expect(buildR2Endpoint("account-id")).toBe(
      "https://account-id.r2.cloudflarestorage.com",
    );
  });
});
