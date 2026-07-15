import type { ComponentProps } from "react";
import { ActionLink, Button, TextArea } from "@/components/atoms";
import {
  FormActions,
  FormField,
  FormMessage,
  ModalDialog,
} from "@/components/molecules";
import { formatPeriodMonth } from "./fee-list";
import styles from "./FeeNoteModal.module.scss";

type FeeNoteModalProps = {
  action: NonNullable<ComponentProps<"form">["action"]>;
  closeHref: string;
  direction: string;
  errorCode?: string;
  memberId: string;
  memberName: string;
  memo: string;
  periodMonth: string;
  query: string;
  sort: string;
};

function getFeeNoteErrorMessage(errorCode?: string) {
  switch (errorCode) {
    case "too-long":
      return "메모는 500자 이하로 입력하세요.";
    case "forbidden":
      return "회비 메모를 수정할 권한이 없습니다.";
    case "invalid-member":
      return "선택한 회원의 회비 메모를 수정할 수 없습니다.";
    case "invalid-input":
      return "메모 정보를 다시 확인하세요.";
    case "save-failed":
      return "메모를 저장하지 못했습니다. 다시 시도하세요.";
    default:
      return null;
  }
}

export function FeeNoteModal(props: FeeNoteModalProps) {
  const errorMessage = getFeeNoteErrorMessage(props.errorCode);

  return (
    <ModalDialog
      closeHref={props.closeHref}
      title={`${props.memberName} ${formatPeriodMonth(props.periodMonth)} 회비 메모`}
    >
      <form action={props.action} className={styles["fee-note-form"]}>
        <input name="memberId" type="hidden" value={props.memberId} />
        <input
          name="periodMonth"
          type="hidden"
          value={props.periodMonth.slice(0, 7)}
        />
        <input name="query" type="hidden" value={props.query} />
        <input name="sort" type="hidden" value={props.sort} />
        <input name="direction" type="hidden" value={props.direction} />
        <FormField label="메모">
          <TextArea
            aria-describedby={errorMessage ? "fee-note-error" : undefined}
            defaultValue={props.memo}
            maxLength={500}
            name="memo"
            rows={6}
          />
        </FormField>
        {errorMessage ? (
          <FormMessage id="fee-note-error">{errorMessage}</FormMessage>
        ) : null}
        <FormActions>
          <ActionLink href={props.closeHref} variant="secondary">
            취소
          </ActionLink>
          <Button type="submit">저장</Button>
        </FormActions>
      </form>
    </ModalDialog>
  );
}
