"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  parseEventFormData,
  toEventDatabaseInput,
  validateEventForm,
} from "@/features/events/event-form";
import { createClient } from "@/lib/supabase/server";

const schedulePath = "/schedule";
const eventCreatePath = "/schedule/new";

function buildRedirect(path: string, params: Record<string, string | number>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value));
  }

  return `${path}?${searchParams.toString()}`;
}

function firstValidationCode(errors: string[]) {
  if (errors.some((error) => error.includes("날짜"))) {
    return "invalid-date";
  }

  if (errors.some((error) => error.includes("시간"))) {
    return "invalid-time";
  }

  if (errors.some((error) => error.includes("이름"))) {
    return "invalid-title";
  }

  if (errors.some((error) => error.includes("장소"))) {
    return "invalid-location";
  }

  return "invalid-event";
}

async function getAuthenticatedUserId() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { supabase, userId: user.id };
}

export async function createEvent(formData: FormData) {
  const event = parseEventFormData(formData);
  const errors = validateEventForm(event);

  if (errors.length > 0) {
    redirect(buildRedirect(eventCreatePath, { error: firstValidationCode(errors) }));
  }

  const { supabase, userId } = await getAuthenticatedUserId();
  const { error } = await supabase.from("events").insert({
    ...toEventDatabaseInput(event),
    created_by: userId,
    updated_by: userId,
  });

  if (error) {
    redirect(buildRedirect(eventCreatePath, { error: "save-failed" }));
  }

  revalidatePath(schedulePath);
  redirect(
    buildRedirect(schedulePath, {
      month: event.eventDate.slice(0, 7),
      status: "created",
    }),
  );
}

export async function updateEvent(formData: FormData) {
  const eventId = String(formData.get("id") ?? "");
  const event = parseEventFormData(formData);
  const errors = validateEventForm(event);
  const editPath = `${schedulePath}/${eventId}/edit`;

  if (!eventId) {
    redirect(buildRedirect(schedulePath, { error: "missing-event" }));
  }

  if (errors.length > 0) {
    redirect(buildRedirect(editPath, { error: firstValidationCode(errors) }));
  }

  const { supabase, userId } = await getAuthenticatedUserId();
  const { error } = await supabase
    .from("events")
    .update({
      ...toEventDatabaseInput(event),
      updated_by: userId,
    })
    .eq("id", eventId);

  if (error) {
    redirect(buildRedirect(editPath, { error: "save-failed" }));
  }

  revalidatePath(schedulePath);
  revalidatePath(editPath);
  redirect(
    buildRedirect(schedulePath, {
      month: event.eventDate.slice(0, 7),
      status: "updated",
    }),
  );
}

export async function deleteEvent(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const month = String(formData.get("month") ?? "");

  if (!eventId) {
    redirect(buildRedirect(schedulePath, { error: "missing-event" }));
  }

  const { supabase } = await getAuthenticatedUserId();
  const { error } = await supabase.from("events").delete().eq("id", eventId);

  if (error) {
    redirect(buildRedirect(schedulePath, { error: "delete-failed" }));
  }

  revalidatePath(schedulePath);
  redirect(
    buildRedirect(schedulePath, {
      month,
      status: "deleted",
    }),
  );
}
