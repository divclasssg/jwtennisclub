import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { loadMeetingScheduleRecords } from "./meeting-schedule";

describe("meeting schedule loader", () => {
  const query = {
    gte: vi.fn(),
    lt: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
  };

  beforeEach(() => {
    Object.values(query).forEach((mock) => mock.mockReset());
    query.select.mockReturnValue(query);
    query.gte.mockReturnValue(query);
    query.lt.mockReturnValue(query);
    query.order.mockReturnValueOnce(query).mockResolvedValueOnce({
      data: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          meeting_kind: "lightning",
          period_month: "2026-07-01",
          meeting_date: "2026-08-01",
          start_time: "18:00:00",
          title: "대체 번개",
          location: "용마테니스장",
          cancelled_at: null,
          attendance_closed_at: null,
        },
      ],
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      from: vi.fn(() => query),
    });
  });

  it("queries meeting_date in the exact requested range and maps period month", async () => {
    await expect(
      loadMeetingScheduleRecords({ start: "2026-07-26", end: "2026-08-02" }),
    ).resolves.toEqual([
      expect.objectContaining({
        meetingKind: "lightning",
        periodMonth: "2026-07-01",
        meetingDate: "2026-08-01",
        startTime: "18:00",
        location: "용마테니스장",
        status: "scheduled",
      }),
    ]);
    expect(query.gte).toHaveBeenCalledWith("meeting_date", "2026-07-26");
    expect(query.lt).toHaveBeenCalledWith("meeting_date", "2026-08-02");
  });

  it("fails the source instead of returning a partial meeting list", async () => {
    query.order.mockReset();
    query.order.mockReturnValueOnce(query).mockResolvedValueOnce({
      data: null,
      error: { message: "permission denied" },
    });
    await expect(
      loadMeetingScheduleRecords({ start: "2026-07-01", end: "2026-08-01" }),
    ).rejects.toThrow("정모 일정을 불러오지 못했습니다.");
  });

  it("rejects malformed meeting rows at the source boundary", async () => {
    query.order.mockReset();
    query.order.mockReturnValueOnce(query).mockResolvedValueOnce({
      data: [
        {
          id: "not-a-uuid",
          meeting_kind: "practice",
          period_month: "2026-07-01",
          meeting_date: "2026-07-04",
          start_time: "18:00:00",
          title: "잘못된 회차",
          location: null,
          cancelled_at: null,
          attendance_closed_at: null,
        },
      ],
      error: null,
    });

    await expect(
      loadMeetingScheduleRecords({ start: "2026-07-01", end: "2026-08-01" }),
    ).rejects.toThrow("정모 일정을 불러오지 못했습니다.");
  });
});
