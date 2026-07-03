import Link from "next/link";
import { MEMBER_STATUSES, type MemberStatus } from "./member-model";
import { formatMemberStatus, type MemberListRow } from "./member-list";
import styles from "./MemberForm.module.scss";

type MemberFormProps = {
  action: (formData: FormData) => void;
  mode: "create" | "edit";
  member?: MemberListRow;
};

export function MemberForm({ action, mode, member }: MemberFormProps) {
  return (
    <form action={action} className={styles["member-form"]}>
      {member ? <input name="id" type="hidden" value={member.id} /> : null}

      <div className={styles["member-form-grid"]}>
        <label>
          이름
          <input
            defaultValue={member?.name}
            maxLength={50}
            name="name"
            required
            type="text"
          />
        </label>
        <label>
          전화번호 끝 4자리
          <input
            defaultValue={member?.phoneLastFour ?? ""}
            inputMode="numeric"
            maxLength={4}
            name="phoneLastFour"
            pattern="[0-9]{4}"
            placeholder="1234"
            type="text"
          />
        </label>
        <label>
          가입일
          <input
            defaultValue={member?.joinedDate}
            name="joinedDate"
            required
            type="date"
          />
        </label>
        <label>
          상태
          <select defaultValue={member?.status ?? "active"} name="status">
            {MEMBER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {formatMemberStatus(status)}
              </option>
            ))}
          </select>
        </label>
        <label>
          탈퇴일
          <input
            defaultValue={member?.withdrawnDate ?? ""}
            name="withdrawnDate"
            type="date"
          />
        </label>
        <label>
          탈퇴 사유
          <input
            defaultValue={member?.withdrawalReason ?? ""}
            maxLength={100}
            name="withdrawalReason"
            type="text"
          />
        </label>
      </div>

      <label>
        메모
        <textarea
          defaultValue={member?.memo ?? ""}
          maxLength={500}
          name="memo"
          rows={4}
        />
      </label>

      <div className={styles["member-form-actions"]}>
        <Link href="/members">취소</Link>
        <button type="submit">
          {mode === "create" ? "회원 등록" : "변경 저장"}
        </button>
      </div>
    </form>
  );
}

export type MemberFormStatus = MemberStatus;
