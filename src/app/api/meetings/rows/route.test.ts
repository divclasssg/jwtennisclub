import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ mutateMeetingRow: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/features/meetings/meeting-row-mutation", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/features/meetings/meeting-row-mutation")
  >();
  return { ...actual, mutateMeetingRow: mocks.mutateMeetingRow };
});

import { POST } from "./route";

const validBody = {
  kind: "rsvp",
  meetingId: "11111111-1111-4111-8111-111111111111",
  memberId: "22222222-2222-4222-8222-222222222222",
  rsvpStatus: "attending",
  expectedUpdatedAt: "2026-07-14T09:00:00.000Z",
};

function createRequest(
  body: string,
  headers: Record<string, string> = {},
) {
  return new Request("http://localhost/api/meetings/rows", {
    method: "POST",
    body,
    headers,
  });
}

describe("meeting row route", () => {
  beforeEach(() => {
    mocks.mutateMeetingRow.mockReset();
    mocks.mutateMeetingRow.mockResolvedValue({
      status: "error",
      message: "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
    });
  });

  it("requires a bounded JSON-only request", async () => {
    const wrongContentType = await POST(
      createRequest(JSON.stringify(validBody), {
        "content-type": "text/plain",
      }),
    );
    expect(wrongContentType.status).toBe(415);

    const jsonPrefixOnly = await POST(
      createRequest(JSON.stringify(validBody), {
        "content-type": "application/jsonp",
      }),
    );
    expect(jsonPrefixOnly.status).toBe(415);

    const oversized = await POST(
      createRequest("{}", {
        "content-length": "16385",
        "content-type": "application/json",
      }),
    );
    expect(oversized.status).toBe(413);
    expect(mocks.mutateMeetingRow).not.toHaveBeenCalled();
  });

  it("cancels a chunked body as soon as it crosses the byte limit", async () => {
    let readPastLimit = false;
    let pullCount = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pullCount += 1;
          if (pullCount <= 2) {
            controller.enqueue(new Uint8Array(9_000));
            return;
          }
          readPastLimit = true;
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const request = new Request("http://localhost/api/meetings/rows", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const result = await POST(request);

    expect(result.status).toBe(413);
    expect(readPastLimit).toBe(false);
    expect(mocks.mutateMeetingRow).not.toHaveBeenCalled();
  });

  it("rejects cross-origin and cross-site cookie requests", async () => {
    const crossOrigin = await POST(
      createRequest(JSON.stringify(validBody), {
        "content-type": "application/json",
        origin: "https://evil.example",
      }),
    );
    expect(crossOrigin.status).toBe(403);

    const crossSite = await POST(
      createRequest(JSON.stringify(validBody), {
        "content-type": "application/json",
        "sec-fetch-site": "cross-site",
      }),
    );
    expect(crossSite.status).toBe(403);
    expect(mocks.mutateMeetingRow).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and unknown input fields with a stable error", async () => {
    const malformed = await POST(
      createRequest("{", { "content-type": "application/json" }),
    );
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({
      status: "error",
      message: "입력값을 확인해 주세요.",
    });

    const unknownField = await POST(
      createRequest(JSON.stringify({ ...validBody, actorId: "spoofed" }), {
        "content-type": "application/json",
      }),
    );
    expect(unknownField.status).toBe(400);
    expect(mocks.mutateMeetingRow).not.toHaveBeenCalled();
  });

  it("dispatches a valid same-origin request and returns the safe result", async () => {
    const result = {
      status: "saved",
      row: {
        meetingId: validBody.meetingId,
        memberId: validBody.memberId,
        rsvpStatus: "attending",
        attendanceStatus: "unchecked",
        arrivalTime: null,
        rsvpUpdatedAt: "2026-07-14T09:01:00.000Z",
        attendanceUpdatedAt: validBody.expectedUpdatedAt,
      },
    } as const;
    mocks.mutateMeetingRow.mockResolvedValue(result);

    const response = await POST(
      createRequest(JSON.stringify(validBody), {
        "content-type": "application/json; charset=utf-8",
        origin: "http://localhost",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
    expect(mocks.mutateMeetingRow).toHaveBeenCalledWith(validBody);
  });
});
