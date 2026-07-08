import { readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Button, TextInput } from "@/components/atoms";
import {
  EmptyState,
  CsvUploadField,
  FilterBar,
  FormActions,
  FormField,
  FormGrid,
  FormMessage,
  ModalDialog,
  PanelHeader,
  RowActions,
  SummaryCard,
  SummaryGrid,
  TabLink,
  Tabs,
  TableScrollArea,
} from ".";

const back = vi.fn();
const moleculesStyles = readFileSync(
  "src/components/molecules/Molecules.module.scss",
  "utf8",
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back,
  }),
}));

describe("molecules", () => {
  beforeEach(() => {
    back.mockClear();
  });

  it("renders summary cards inside a labelled grid", () => {
    render(
      <SummaryGrid aria-label="요약" columns={2}>
        <SummaryCard label="건수" value="2건" />
        <SummaryCard label="합계" value="30,000원" />
      </SummaryGrid>,
    );

    const grid = screen.getByRole("region", { name: "요약" });
    expect(within(grid).getByText("건수")).toBeInTheDocument();
    expect(within(grid).getByText("30,000원")).toBeInTheDocument();
  });

  it("renders filter fields and submit actions", () => {
    render(
      <FilterBar aria-label="검색 필터" layout="search">
        <FormField label="검색">
          <TextInput name="q" shape="pill" />
        </FormField>
        <Button type="submit">조회</Button>
      </FilterBar>,
    );

    expect(screen.getByRole("form", { name: "검색 필터" })).toBeInTheDocument();
    expect(screen.getByLabelText("검색")).toHaveAttribute("name", "q");
    expect(screen.getByRole("button", { name: "조회" })).toBeInTheDocument();
  });

  it("keeps filter bars from using grid-based column splits", () => {
    const filterBarRule = moleculesStyles.match(/\.filter-bar\s*\{(?<body>[^}]*)\}/);
    const layoutRules = [
      ".filter-search",
      ".filter-month-search-status",
      ".filter-two-controls",
      ".filter-single-control",
    ];

    expect(filterBarRule?.groups?.body).not.toContain("display: grid");

    for (const selector of layoutRules) {
      const rule = moleculesStyles.match(
        new RegExp(`${selector.replace(".", "\\.")}\\s*\\{(?<body>[^}]*)\\}`),
      );

      expect(rule?.groups?.body).not.toContain("grid-template-columns");
    }
  });

  it("renders panel headings with optional side content", () => {
    render(
      <PanelHeader
        title="2026.07 · 총 2명"
        side={<a href="/members">필터 초기화</a>}
      />,
    );

    expect(screen.getByText("2026.07 · 총 2명")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "필터 초기화" })).toHaveAttribute(
      "href",
      "/members",
    );
  });

  it("renders current-state tabs", () => {
    render(
      <Tabs aria-label="회원 상태">
        <TabLink href="/members?status=active" isCurrent>
          활동
        </TabLink>
        <TabLink href="/members?status=paused">휴회</TabLink>
      </Tabs>,
    );

    expect(screen.getByRole("navigation", { name: "회원 상태" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "활동" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("renders row actions and empty states", () => {
    render(
      <>
        <RowActions>
          <a href="/edit">수정</a>
          <button type="button">삭제</button>
        </RowActions>
        <EmptyState
          title="표시할 항목이 없습니다"
          description="필터를 조정해 다시 확인하세요."
        />
      </>,
    );

    expect(screen.getByRole("link", { name: "수정" })).toHaveAttribute(
      "href",
      "/edit",
    );
    expect(
      screen.getByRole("heading", { name: "표시할 항목이 없습니다" }),
    ).toBeInTheDocument();
  });

  it("wraps wide tables without changing table semantics", () => {
    render(
      <TableScrollArea>
        <table>
          <tbody>
            <tr>
              <td>값</td>
            </tr>
          </tbody>
        </table>
      </TableScrollArea>,
    );

    expect(screen.getByRole("cell", { name: "값" })).toBeInTheDocument();
  });

  it("renders form messages with status semantics", () => {
    render(
      <>
        <FormMessage>입력값을 확인하세요.</FormMessage>
        <FormMessage tone="success">저장되었습니다.</FormMessage>
      </>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("입력값을 확인하세요.");
    expect(screen.getByRole("status")).toHaveTextContent("저장되었습니다.");
  });

  it("renders a reusable CSV upload field", () => {
    render(<CsvUploadField />);

    const input = screen.getByLabelText("CSV 파일");
    expect(input).toHaveAttribute("name", "csvFile");
    expect(input).toHaveAttribute("accept", ".csv,text/csv");
    expect(input).toBeRequired();
  });

  it("renders reusable form action rows", () => {
    render(
      <FormActions>
        <a href="/members">취소</a>
        <button type="submit">저장</button>
      </FormActions>,
    );

    expect(screen.getByRole("link", { name: "취소" })).toHaveAttribute(
      "href",
      "/members",
    );
    expect(screen.getByRole("button", { name: "저장" })).toBeInTheDocument();
  });

  it("renders a reusable form grid", () => {
    render(
      <FormGrid>
        <FormField label="이름">
          <TextInput name="name" />
        </FormField>
        <FormField label="가입일">
          <TextInput name="joinedDate" type="date" />
        </FormField>
      </FormGrid>,
    );

    expect(screen.getByLabelText("이름")).toHaveAttribute("name", "name");
    expect(screen.getByLabelText("가입일")).toHaveAttribute("type", "date");
  });

  it("renders a modal dialog with close navigation", () => {
    render(
      <ModalDialog title="회원 등록">
        <p>회원 폼</p>
      </ModalDialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "회원 등록" });
    expect(within(dialog).getByText("회원 폼")).toBeInTheDocument();

    screen.getByRole("button", { name: "닫기" }).click();
    expect(back).toHaveBeenCalledTimes(1);
  });
});
