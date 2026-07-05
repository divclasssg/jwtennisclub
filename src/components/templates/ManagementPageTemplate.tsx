import type { ReactNode } from "react";
import { PageHeader } from "@/components/organisms";
import styles from "./Templates.module.scss";

type ManagementPageTemplateProps = {
  action?: ReactNode;
  description?: ReactNode;
  filters?: ReactNode;
  kicker: ReactNode;
  list: ReactNode;
  summary?: ReactNode;
  tabs?: ReactNode;
  title: ReactNode;
};

export function ManagementPageTemplate({
  action,
  description,
  filters,
  kicker,
  list,
  summary,
  tabs,
  title,
}: ManagementPageTemplateProps) {
  return (
    <section className={styles["management-page"]}>
      <PageHeader
        action={action}
        description={description}
        kicker={kicker}
        title={title}
      />
      {tabs}
      {summary}
      {filters}
      {list}
    </section>
  );
}
