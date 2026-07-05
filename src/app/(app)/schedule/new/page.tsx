import { createEvent } from "../actions";
import { FormPanel } from "@/components/organisms";
import { FormPageTemplate } from "@/components/templates";
import { EventForm } from "@/features/events/EventForm";

export default function NewEventPage() {
  return (
    <FormPageTemplate
      description="운영 일정의 날짜, 시간, 이름, 장소를 등록합니다."
      kicker="일정 관리"
      title="일정 등록"
    >
      <FormPanel title="일정 정보">
        <EventForm action={createEvent} submitLabel="일정 등록" />
      </FormPanel>
    </FormPageTemplate>
  );
}
