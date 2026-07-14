import {
  meetingRowMutationRequestSchema,
  mutateMeetingRow,
} from "@/features/meetings/meeting-row-mutation";

const MAX_BODY_BYTES = 16_384;
const invalidInputResult = {
  status: "error",
  message: "입력값을 확인해 주세요.",
} as const;

function errorResponse(status: number) {
  return Response.json(invalidInputResult, { status });
}

function isAllowedRequestOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function readBoundedBody(request: Request) {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bodyText = "";
  let bodyBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      bodyBytes += value.byteLength;
      if (bodyBytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      bodyText += decoder.decode(value, { stream: true });
    }
    return bodyText + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase();
  if (contentType?.split(";", 1)[0]?.trim() !== "application/json") {
    return errorResponse(415);
  }
  if (!isAllowedRequestOrigin(request)) {
    return errorResponse(403);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return errorResponse(413);
  }

  const bodyText = await readBoundedBody(request);
  if (bodyText === null) {
    return errorResponse(413);
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return errorResponse(400);
  }

  const parsed = meetingRowMutationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400);
  }

  return Response.json(await mutateMeetingRow(parsed.data));
}
