import { useId, type HTMLAttributes, type ReactNode } from "react";
import { classNames } from "@/components/ui/class-names";
import styles from "./Organisms.module.scss";

type FormPanelProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  description?: ReactNode;
  title: ReactNode;
};

export function FormPanel({
  children,
  className,
  description,
  title,
  ...props
}: FormPanelProps) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className={classNames(styles["form-panel"], className)}
      {...props}
    >
      <div className={styles["form-panel-header"]}>
        <h2 id={headingId}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
