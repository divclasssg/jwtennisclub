import { describe, expect, it } from "vitest";
import {
  buildReceiptObjectKey,
  getReceiptFileValidationError,
  readReceiptFile,
} from "./receipt-file";

describe("receipt file helpers", () => {
  it("reads an optional receipt file from form data", () => {
    const formData = new FormData();
    const receiptFile = new File(["receipt"], "receipt.jpg", {
      type: "image/jpeg",
    });

    formData.set("receiptFile", receiptFile);

    expect(readReceiptFile(formData)).toBe(receiptFile);
  });

  it("validates receipt file type and size", () => {
    expect(
      getReceiptFileValidationError(
        new File(["receipt"], "receipt.pdf", { type: "application/pdf" }),
      ),
    ).toBeNull();
    expect(
      getReceiptFileValidationError(
        new File(["receipt"], "receipt.txt", { type: "text/plain" }),
      ),
    ).toBe("invalid-receipt-type");
    expect(
      getReceiptFileValidationError(
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], "receipt.jpg", {
          type: "image/jpeg",
        }),
      ),
    ).toBe("receipt-too-large");
  });

  it("builds a private R2 object key for the expense receipt", () => {
    expect(
      buildReceiptObjectKey({
        expenseDate: "2026-07-03",
        fileName: "7월 영수증.JPG",
        randomId: "fixed-id",
        timestamp: 1_783_075_200_000,
        userId: "operator-id",
      }),
    ).toBe("expenses/operator-id/2026/07/1783075200000-fixed-id.jpg");
  });
});
