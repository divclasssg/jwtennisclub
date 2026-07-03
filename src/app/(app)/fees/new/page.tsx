import { createFeePayment } from "../actions";
import styles from "./page.module.scss";
import { FeePaymentForm } from "@/features/fees/FeePaymentForm";
import {
  getCurrentPeriodMonth,
  normalizePeriodMonth,
} from "@/features/fees/fee-model";
import { firstSearchParam, mapMemberRow } from "@/features/members/member-list";
import { createClient } from "@/lib/supabase/server";

type NewFeePaymentPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    month?: string | string[];
  }>;
};

function getErrorMessage(error: string | undefined) {
  if (error === "invalid-member") {
    return "회원을 선택하세요.";
  }

  if (error === "invalid-period-month") {
    return "납부 월을 확인하세요.";
  }

  if (error === "invalid-amount") {
    return "납부 금액을 확인하세요.";
  }

  if (error === "invalid-paid-date") {
    return "납부일을 확인하세요.";
  }

  if (error === "save-failed") {
    return "납부 기록을 저장하지 못했습니다. 중복 기록, 권한, 입력값을 확인하세요.";
  }

  return null;
}

async function getActiveMembers() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .select(
      "id, name, phone_last_four, status, joined_date, withdrawn_date, withdrawal_reason, memo",
    )
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) {
    throw new Error("납부 등록 대상 회원을 불러오지 못했습니다.");
  }

  return (data ?? []).map(mapMemberRow);
}

function getTodayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export default async function NewFeePaymentPage({
  searchParams,
}: NewFeePaymentPageProps) {
  const params = await searchParams;
  const defaultPeriodMonth =
    normalizePeriodMonth(firstSearchParam(params.month)) || getCurrentPeriodMonth();
  const members = await getActiveMembers();
  const errorMessage = getErrorMessage(firstSearchParam(params.error));

  return (
    <section className={styles["fee-create-page"]}>
      <header className={styles["fee-create-header"]}>
        <div>
          <p className={styles["fee-create-kicker"]}>회비 납부</p>
          <h1>납부 등록</h1>
        </div>
        <p>
          입금 확인이 끝난 회원의 납부 월, 금액, 납부일을 기록합니다. 같은
          회원과 같은 월은 한 번만 등록할 수 있습니다.
        </p>
      </header>

      <section className={styles["fee-create-panel"]}>
        <div className={styles["fee-section-header"]}>
          <h2>납부 정보</h2>
          <p>활동 중인 회원만 납부 등록 대상에 표시됩니다.</p>
        </div>
        <FeePaymentForm
          action={createFeePayment}
          defaultPaidDate={getTodayInputValue()}
          defaultPeriodMonth={defaultPeriodMonth}
          members={members}
        />
        {errorMessage ? (
          <p className={styles["fee-form-error"]}>{errorMessage}</p>
        ) : null}
      </section>
    </section>
  );
}
