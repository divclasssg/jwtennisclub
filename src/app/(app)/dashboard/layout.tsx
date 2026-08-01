import styles from "./page.module.scss";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <>
      <h1
        className={styles["dashboard-page-title"]}
        data-hide-shell-title-bar="true"
      >
        홈
      </h1>
      {children}
    </>
  );
}
