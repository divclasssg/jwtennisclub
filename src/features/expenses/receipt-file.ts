export const MAX_RECEIPT_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_RECEIPT_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ReceiptFileValidationCode =
  | "invalid-receipt-type"
  | "receipt-too-large";

type ReceiptObjectKeyInput = {
  expenseDate: string;
  fileName: string;
  randomId?: string;
  timestamp?: number;
  userId: string;
};

export function readReceiptFile(formData: FormData) {
  const value = formData.get("receiptFile");

  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  return value;
}

export function getReceiptFileValidationError(
  file: File,
): ReceiptFileValidationCode | null {
  if (file.size > MAX_RECEIPT_FILE_SIZE) {
    return "receipt-too-large";
  }

  if (!ALLOWED_RECEIPT_CONTENT_TYPES.includes(file.type as never)) {
    return "invalid-receipt-type";
  }

  return null;
}

export function buildReceiptObjectKey(input: ReceiptObjectKeyInput) {
  const [year, month] = input.expenseDate.split("-");
  const timestamp = input.timestamp ?? Date.now();
  const randomId =
    input.randomId ?? crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  const extension = getReceiptExtension(input.fileName);

  return `expenses/${input.userId}/${year}/${month}/${timestamp}-${randomId}.${extension}`;
}

function getReceiptExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (extension && ["jpg", "jpeg", "png", "webp", "pdf"].includes(extension)) {
    return extension === "jpeg" ? "jpg" : extension;
  }

  return "bin";
}
