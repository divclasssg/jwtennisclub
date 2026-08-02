import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FeeMobileList } from "./FeeMobileList";

const rows = [
  {
    memberId: "member-1",
    memberCode: "M0001",
    memberName: "김민수",
    operatorProfileId: null,
    operatorPositionName: null,
    operatorPositionSortOrder: null,
    payment: null,
    note: {
      id: "note-1",
      memberId: "member-1",
      periodMonth: "2026-07-01",
      memo: "다음 달 합산",
      createdBy: "operator-id",
      updatedBy: "operator-id",
      createdAt: "2026-07-03T00:00:00Z",
      updatedAt: "2026-07-03T00:00:00Z",
    },
  },
];

describe("FeeMobileList", () => {
  it("keeps note editing but hides payment mutation actions when locked", () => {
    render(
      <FeeMobileList
        canManageNotes
        cancelPaymentAction={vi.fn((formData: FormData) => {
          void formData;
        })}
        createPaymentAction={vi.fn((formData: FormData) => {
          void formData;
        })}
        isLocked
        listState={{ month: "2026-07" }}
        periodMonth="2026-07-01"
        rows={rows}
        today="2026-07-03"
      />,
    );

    expect(screen.queryByRole("button", { name: "납부 처리" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "납부 취소" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "김민수 메모 수정" }))
      .toBeInTheDocument();
  });
});
