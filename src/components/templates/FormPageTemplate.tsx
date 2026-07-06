import type { ReactNode } from "react";
import { PageTitle } from "@/features/shell/PageTitleContext";
import styles from "./Templates.module.scss";

type FormPageTemplateProps = {
  action?: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  kicker: ReactNode;
  title: ReactNode;
};

export function FormPageTemplate({
  children,
  title,
}: FormPageTemplateProps) {
  return (
    <section className={styles["form-page"]}>
      <PageTitle title={title} />
      {children}
    </section>
  );
}
