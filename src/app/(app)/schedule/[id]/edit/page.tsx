import { updateEvent } from "../../actions";
import { FormPanel } from "@/components/organisms";
import { FormPageTemplate } from "@/components/templates";
import { EventForm } from "@/features/events/EventForm";
import type { EventRecord } from "@/features/events/event-model";
import { createClient } from "@/lib/supabase/server";

type EditEventPageProps = {
  params: Promise<{ id: string }>;
};

type EventDatabaseRow = {
  id: string;
  event_date: string;
  event_time: string;
  title: string;
  location: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

async function getEvent(id: string): Promise<EventRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, event_date, event_time, title, location, created_by, updated_by, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    throw new Error("일정을 불러오지 못했습니다.");
  }

  return mapEventRow(data);
}

export default async function EditEventPage({ params }: EditEventPageProps) {
  const { id } = await params;
  const event = await getEvent(id);

  return (
    <FormPageTemplate
      description="등록된 운영 일정의 날짜, 시간, 이름, 장소를 수정합니다."
      kicker="일정 수정"
      title="일정 관리"
    >
      <FormPanel title="일정 정보">
        <EventForm action={updateEvent} event={event} submitLabel="변경 저장" />
      </FormPanel>
    </FormPageTemplate>
  );
}

function mapEventRow(row: EventDatabaseRow): EventRecord {
  return {
    id: row.id,
    eventDate: row.event_date,
    eventTime: row.event_time.slice(0, 5),
    title: row.title,
    location: row.location,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
