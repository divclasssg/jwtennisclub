import { ActionLink, Button } from "@/components/atoms";
import { FormActions, FormField, FormGrid } from "@/components/molecules";
import styles from "./EventForm.module.scss";

type EventFormValue = {
  id: string;
  eventDate: string;
  eventTime: string;
  title: string;
  location: string;
};

type EventFormProps = {
  action: (formData: FormData) => void;
  event?: EventFormValue;
  submitLabel: string;
};

export function EventForm({ action, event, submitLabel }: EventFormProps) {
  return (
    <form action={action} className={styles["event-form"]}>
      {event ? <input name="id" type="hidden" value={event.id} /> : null}

      <FormGrid>
        <FormField label="일정 날짜">
          <input
            defaultValue={event?.eventDate}
            name="eventDate"
            required
            type="date"
          />
        </FormField>
        <FormField label="일정 시간">
          <input
            defaultValue={event?.eventTime}
            name="eventTime"
            required
            type="time"
          />
        </FormField>
        <FormField label="일정 이름">
          <input
            defaultValue={event?.title}
            maxLength={120}
            name="title"
            required
            type="text"
          />
        </FormField>
        <FormField label="장소">
          <input
            defaultValue={event?.location}
            maxLength={120}
            name="location"
            required
            type="text"
          />
        </FormField>
      </FormGrid>

      <FormActions>
        <ActionLink href="/schedule" variant="secondary">
          취소
        </ActionLink>
        <Button type="submit">{submitLabel}</Button>
      </FormActions>
    </form>
  );
}
