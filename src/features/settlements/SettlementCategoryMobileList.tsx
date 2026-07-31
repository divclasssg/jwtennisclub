import type { SettlementExpenseCategoryRow } from "./settlement-summary";
import {
  formatCurrency,
  formatExpenseCategory,
} from "./settlement-summary";
import styles from "./SettlementCategoryMobileList.module.scss";

type SettlementCategoryMobileListProps = {
  rows: SettlementExpenseCategoryRow[];
};

export function SettlementCategoryMobileList({
  rows,
}: SettlementCategoryMobileListProps) {
  return (
    <ul
      aria-label="모바일 카테고리별 지출"
      className={styles["settlement-mobile-list"]}
    >
      {rows.map((row) => (
        <li className={styles["settlement-mobile-item"]} key={row.category}>
          <h3 className={styles["settlement-mobile-name"]}>
            {formatExpenseCategory(row.category)}
          </h3>
          <div className={styles["settlement-mobile-meta"]}>
            <span>{row.count}건</span>
            <strong>{formatCurrency(row.amount)}원</strong>
          </div>
        </li>
      ))}
    </ul>
  );
}
