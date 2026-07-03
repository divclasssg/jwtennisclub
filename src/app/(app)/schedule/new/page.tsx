import { createEvent } from "../actions";
import { EventForm } from "@/features/events/EventForm";
import styles from "./page.module.scss";

export default function NewEventPage() {
  return (
    <section className={styles["event-form-page"]}>
      <header className={styles["event-form-header"]}>
        <p className={styles["event-form-kicker"]}>일정 관리</p>
        <h1>일정 등록</h1>
      </header>

      <EventForm action={createEvent} submitLabel="일정 등록" />
    </section>
  );
}
