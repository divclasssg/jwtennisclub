import Link from "next/link";
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

      <div className={styles["event-form-grid"]}>
        <label>
          일정 날짜
          <input
            defaultValue={event?.eventDate}
            name="eventDate"
            required
            type="date"
          />
        </label>
        <label>
          일정 시간
          <input
            defaultValue={event?.eventTime}
            name="eventTime"
            required
            type="time"
          />
        </label>
        <label>
          일정 이름
          <input
            defaultValue={event?.title}
            maxLength={120}
            name="title"
            required
            type="text"
          />
        </label>
        <label>
          장소
          <input
            defaultValue={event?.location}
            maxLength={120}
            name="location"
            required
            type="text"
          />
        </label>
      </div>

      <div className={styles["event-form-actions"]}>
        <Link href="/schedule">취소</Link>
        <button type="submit">{submitLabel}</button>
      </div>
    </form>
  );
}
