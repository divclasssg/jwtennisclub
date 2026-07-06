import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import NewFeePaymentPage from "./page";

const membersQuery = {
  select: vi.fn(() => membersQuery),
  eq: vi.fn(() => membersQuery),
  order: vi.fn(async () => ({
    data: [
      {
        id: "member-1",
        name: "김민수",
        phone_last_four: "1234",
        status: "active",
        joined_date: "2026-07-01",
        withdrawn_date: null,
        withdrawal_reason: null,
        memo: null,
      },
    ],
    error: null,
  })),
};

vi.mock("../actions", () => ({
  createFeePayment: vi.fn(),
  importFeePaymentsCsv: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => membersQuery),
  })),
}));

describe("NewFeePaymentPage", () => {
  it("renders a CSV-only payment import page", async () => {
    render(
      await NewFeePaymentPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole("heading", { name: "회비 납부" })).toBeInTheDocument();
    expect(screen.queryByLabelText("회원")).not.toBeInTheDocument();
    expect(screen.getByLabelText("CSV 파일")).toBeInTheDocument();

    const csvSection = screen.getByRole("heading", { name: "업로드 파일" })
      .parentElement?.parentElement;

    expect(csvSection).not.toBeNull();
    expect(
      within(csvSection as HTMLElement).getByRole("button", {
        name: "CSV 등록",
      }),
    ).toBeInTheDocument();
  });
});
