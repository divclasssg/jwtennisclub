import type { ReactNode } from "react";
import { PageHeader } from "@/components/organisms";
import styles from "./Templates.module.scss";

type FormPageTemplateProps = {
  action?: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  kicker: ReactNode;
  title: ReactNode;
};

export function FormPageTemplate({
  action,
  children,
  description,
  kicker,
  title,
}: FormPageTemplateProps) {
  return (
    <section className={styles["form-page"]}>
      <PageHeader
        action={action}
        description={description}
        kicker={kicker}
        title={title}
      />
      {children}
    </section>
  );
}
