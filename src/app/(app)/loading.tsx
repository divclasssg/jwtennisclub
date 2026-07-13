import styles from "./loading.module.scss";

export default function AppLoading() {
  return (
    <div className={styles["loading-panel"]} role="status" aria-live="polite">
      <span aria-hidden="true" className={styles["loading-spinner"]} />
      <span>페이지를 불러오는 중입니다</span>
    </div>
  );
}
