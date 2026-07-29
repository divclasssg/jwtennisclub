import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemberForm } from "./MemberForm";
import type { MemberActionState } from "./member-form";

describe("MemberForm duplicate confirmation", () => {
  it("resubmits the original candidate and matching token", async () => {
    const submissions: FormData[] = [];
    const action = vi.fn(async (_state: MemberActionState, formData: FormData) => {
      submissions.push(formData);
      if (submissions.length === 1) {
        return {
          status: "confirmation-required" as const,
          reason: "phone-reuse" as const,
          candidate: {
            name: String(formData.get("name")),
            phoneNumber: String(formData.get("phoneNumber")),
            groupId: String(formData.get("groupId")),
            status: "paused" as const,
            joinedDate: String(formData.get("joinedDate")),
            withdrawnDate: String(formData.get("withdrawnDate")),
            pauseStartMonth: String(formData.get("pauseStartMonth")),
            memo: String(formData.get("memo")),
            duplicateConfirmation: null,
          },
        };
      }
      return { status: "idle" as const };
    });
    render(<MemberForm action={action} canManageContacts groups={[{ id: "group-a", code: "A" }]} mode="create" />);
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "후보 회원" } });
    fireEvent.change(screen.getByLabelText("연락처"), { target: { value: "010-2345-6789" } });
    fireEvent.change(screen.getByLabelText("그룹"), { target: { value: "group-a" } });
    fireEvent.change(screen.getByLabelText("가입일"), { target: { value: "2026-07-02" } });
    fireEvent.change(screen.getByLabelText("상태"), { target: { value: "paused" } });
    fireEvent.change(screen.getByLabelText("휴회 시작 월"), { target: { value: "2026-08" } });
    fireEvent.change(screen.getByLabelText("탈퇴일"), { target: { value: "2026-07-10" } });
    fireEvent.change(screen.getByLabelText("메모"), { target: { value: "후보 메모" } });
    fireEvent.submit(screen.getByRole("button", { name: "회원 등록" }).closest("form")!);

    expect(await screen.findByRole("button", { name: "확인 후 등록" })).toBeInTheDocument();
    expect(screen.getByLabelText("연락처")).toHaveValue("010-2345-6789");
    fireEvent.submit(screen.getByRole("button", { name: "확인 후 등록" }).closest("form")!);

    await waitFor(() => expect(submissions).toHaveLength(2));
    expect(Object.fromEntries(submissions[1])).toMatchObject({
      name: "후보 회원",
      phoneNumber: "010-2345-6789",
      groupId: "group-a",
      status: "paused",
      joinedDate: "2026-07-02",
      withdrawnDate: "2026-07-10",
      pauseStartMonth: "2026-08",
      memo: "후보 메모",
      duplicateConfirmation: "phone-reuse",
    });
  });
});
