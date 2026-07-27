import type { ComponentProps } from "react";
import { ActionLink, Badge, Button } from "@/components/atoms";
import { formatDate } from "@/features/members/member-list";
import {
  DEFAULT_MONTHLY_FEE_AMOUNT,
} from "./fee-model";
import {
  formatCurrency,
  type FeeBoardMemberRow,
} from "./fee-list";
import styles from "./FeeMobileList.module.scss";
import { buildFeesHref, type FeeListState } from "./fee-note";

type FormAction = NonNullable<ComponentProps<"form">["action"]>;

type FeeMobileListProps = {
  canManageNotes: boolean;
  cancelPaymentAction: FormAction;
  createPaymentAction: FormAction;
  periodMonth: string;
  rows: FeeBoardMemberRow[];
  today: string;
  listState: FeeListState;
};

function formatPaymentStatus(row: FeeBoardMemberRow) {
  return row.payment ? "납부완료" : "미납";
}

export function FeeMobileList({
  canManageNotes,
  cancelPaymentAction,
  createPaymentAction,
  periodMonth,
  rows,
  today,
  listState,
}: FeeMobileListProps) {
  return (
    <ul aria-label="모바일 회비 목록" className={styles["fee-mobile-list"]}>
      {rows.map((row) => {
        const amount = row.payment?.amount ?? DEFAULT_MONTHLY_FEE_AMOUNT;

        return (
          <li className={styles["fee-mobile-item"]} key={row.memberId}>
            <div className={styles["fee-mobile-header"]}>
              <div className={styles["fee-mobile-title"]}>
                <h3 className={styles["fee-mobile-name"]}>{row.memberName}</h3>
                <div className={styles["fee-mobile-badges"]}>
                  <Badge tone={row.payment ? "success" : "danger"}>
                    {formatPaymentStatus(row)}
                  </Badge>
                </div>
              </div>
              {row.payment ? (
                <form action={cancelPaymentAction} className={styles["fee-mobile-action"]}>
                  <input name="paymentId" type="hidden" value={row.payment.id} />
                  <input name="periodMonth" type="hidden" value={periodMonth} />
                  <Button size="compact" type="submit" variant="danger">
                    납부 취소
                  </Button>
                </form>
              ) : (
                <form action={createPaymentAction} className={styles["fee-mobile-action"]}>
                  <input name="memberId" type="hidden" value={row.memberId} />
                  <input name="periodMonth" type="hidden" value={periodMonth} />
                  <input name="paidDate" type="hidden" value={today} />
                  <input name="amount" type="hidden" value={DEFAULT_MONTHLY_FEE_AMOUNT} />
                  <Button size="compact" type="submit">
                    납부 처리
                  </Button>
                </form>
              )}
            </div>

            <div className={styles["fee-mobile-detail-list"]}>
              <p className={styles["fee-mobile-detail"]}>
                회원번호 {row.memberCode}
              </p>
              <p className={styles["fee-mobile-detail"]}>
                기준 금액 {formatCurrency(amount)}원
              </p>
              <p className={styles["fee-mobile-detail"]}>
                납부일 {row.payment ? formatDate(row.payment.paidDate) : "-"}
              </p>
              <div className={styles["fee-mobile-note"]}>
                <span>메모</span>
                <div className={styles["fee-mobile-note-content"]}>
                  <span className={styles["fee-mobile-note-summary"]}>
                    {row.note?.memo ?? "-"}
                  </span>
                  {canManageNotes ? (
                    <ActionLink
                      aria-label={`${row.memberName} 메모 ${row.note ? "수정" : "입력"}`}
                      href={buildFeesHref(listState, { note: row.memberId })}
                      size="compact"
                      variant="secondary"
                    >
                      {row.note ? "수정" : "메모 입력"}
                    </ActionLink>
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
