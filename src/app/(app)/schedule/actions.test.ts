import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const eventsTable = {
    delete: vi.fn(() => eventsTable),
    eq: vi.fn(async () => ({ error: null })),
    insert: vi.fn(async () => ({ error: null })),
    update: vi.fn(() => eventsTable),
  };
  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "operator-id" } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table !== "events") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return eventsTable;
    }),
  };

  return {
    eventsTable,
    revalidatePath: vi.fn(),
    redirect: vi.fn((path: string) => {
      throw new Error(`redirect:${path}`);
    }),
    supabase,
  };
});

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mocks.supabase),
}));

import { createEvent, deleteEvent, updateEvent } from "./actions";

describe("schedule actions", () => {
  beforeEach(() => {
    mocks.redirect.mockClear();
    mocks.revalidatePath.mockClear();
    mocks.supabase.auth.getUser.mockClear();
    mocks.supabase.from.mockClear();
    mocks.eventsTable.delete.mockClear();
    mocks.eventsTable.eq.mockClear();
    mocks.eventsTable.eq.mockResolvedValue({ error: null });
    mocks.eventsTable.insert.mockClear();
    mocks.eventsTable.insert.mockResolvedValue({ error: null });
    mocks.eventsTable.update.mockClear();
  });

  it("creates an event with authenticated audit fields", async () => {
    const formData = new FormData();
    formData.set("eventDate", "2026-07-11");
    formData.set("eventTime", "09:30");
    formData.set("title", "정기 모임");
    formData.set("location", "올림픽공원");

    await expect(createEvent(formData)).rejects.toThrow(
      "redirect:/schedule?month=2026-07&status=created",
    );

    expect(mocks.eventsTable.insert).toHaveBeenCalledWith({
      event_date: "2026-07-11",
      event_time: "09:30",
      title: "정기 모임",
      location: "올림픽공원",
      created_by: "operator-id",
      updated_by: "operator-id",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/schedule");
  });

  it("updates an event with the authenticated updater", async () => {
    const formData = new FormData();
    formData.set("id", "event-1");
    formData.set("eventDate", "2026-07-12");
    formData.set("eventTime", "10:00");
    formData.set("title", "친선 경기");
    formData.set("location", "실내 코트");

    await expect(updateEvent(formData)).rejects.toThrow(
      "redirect:/schedule?month=2026-07&status=updated",
    );

    expect(mocks.eventsTable.update).toHaveBeenCalledWith({
      event_date: "2026-07-12",
      event_time: "10:00",
      title: "친선 경기",
      location: "실내 코트",
      updated_by: "operator-id",
    });
    expect(mocks.eventsTable.eq).toHaveBeenCalledWith("id", "event-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/schedule");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/schedule/event-1/edit");
  });

  it("deletes an event", async () => {
    const formData = new FormData();
    formData.set("eventId", "event-1");
    formData.set("month", "2026-07");

    await expect(deleteEvent(formData)).rejects.toThrow(
      "redirect:/schedule?month=2026-07&status=deleted",
    );

    expect(mocks.eventsTable.delete).toHaveBeenCalled();
    expect(mocks.eventsTable.eq).toHaveBeenCalledWith("id", "event-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/schedule");
  });
});
