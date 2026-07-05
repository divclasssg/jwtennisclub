import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActionLink } from "@/components/atoms";
import { EmptyState } from "@/components/molecules";
import { DataPanel, DataTable, FormPanel, PageHeader } from ".";

describe("organisms", () => {
  it("renders a reusable page header", () => {
    render(
      <PageHeader
        action={<ActionLink href="/members/new">회원 등록</ActionLink>}
        description="회원 상태를 기준으로 관리합니다."
        kicker="회원 관리"
        title="회원 목록"
      />,
    );

    expect(screen.getByText("회원 관리")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "회원 목록" })).toBeInTheDocument();
    expect(screen.getByText("회원 상태를 기준으로 관리합니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "회원 등록" })).toHaveAttribute(
      "href",
      "/members/new",
    );
  });

  it("renders a data panel with heading and content or empty state", () => {
    render(
      <DataPanel
        aria-label="회원 목록"
        headerSide={<a href="/members">필터 초기화</a>}
        headerTitle="총 2명"
      >
        <p>김민수</p>
      </DataPanel>,
    );

    const panel = screen.getByRole("region", { name: "회원 목록" });
    expect(within(panel).getByText("총 2명")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "필터 초기화" })).toHaveAttribute(
      "href",
      "/members",
    );
    expect(within(panel).getByText("김민수")).toBeInTheDocument();
  });

  it("renders a data panel empty state when content is absent", () => {
    render(
      <DataPanel
        aria-label="지출 목록"
        empty={<EmptyState title="등록된 지출이 없습니다" />}
        headerTitle="총 0건"
      />,
    );

    const panel = screen.getByRole("region", { name: "지출 목록" });
    expect(
      within(panel).getByRole("heading", { name: "등록된 지출이 없습니다" }),
    ).toBeInTheDocument();
  });

  it("renders a reusable data table inside a scroll area", () => {
    render(
      <DataTable aria-label="회원 테이블">
        <thead>
          <tr>
            <th scope="col">이름</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">김민수</th>
          </tr>
        </tbody>
      </DataTable>,
    );

    const table = screen.getByRole("table", { name: "회원 테이블" });
    expect(table).toHaveClass(/data-table/);
    expect(within(table).getByRole("rowheader", { name: "김민수" })).toBeInTheDocument();
  });

  it("renders a reusable form panel with heading and description", () => {
    render(
      <FormPanel description="필수 정보를 입력하세요." title="단건 등록">
        <button type="button">저장</button>
      </FormPanel>,
    );

    const panel = screen.getByRole("region", { name: "단건 등록" });
    expect(
      within(panel).getByRole("heading", { name: "단건 등록" }),
    ).toBeInTheDocument();
    expect(within(panel).getByText("필수 정보를 입력하세요.")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "저장" })).toBeInTheDocument();
  });
});
