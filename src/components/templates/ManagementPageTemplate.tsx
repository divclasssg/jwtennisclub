import type { ReactNode } from "react";
import { PageTitle } from "@/features/shell/PageTitleContext";
import styles from "./Templates.module.scss";

type ManagementPageTemplateProps = {
  description?: ReactNode;
  filters?: ReactNode;
  kicker: ReactNode;
  list: ReactNode;
  summary?: ReactNode;
  tabs?: ReactNode;
  title: ReactNode;
};

export function ManagementPageTemplate({
  filters,
  list,
  summary,
  tabs,
  title,
}: ManagementPageTemplateProps) {
  return (
    <section className={styles["management-page"]}>
      <PageTitle title={title} />
      {tabs}
      {summary}
      {filters}
      <div className={styles["management-list"]}>{list}</div>
    </section>
  );
}
