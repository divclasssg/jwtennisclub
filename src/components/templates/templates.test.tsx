import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FilterBar } from "@/components/molecules";
import { PageTitleProvider, ShellPageTitle } from "@/features/shell/PageTitleContext";
import { FormPageTemplate, ManagementPageTemplate } from ".";

describe("templates", () => {
  it("renders management screens in the expected order", () => {
    render(
      <PageTitleProvider>
        <ShellPageTitle fallback="기본 제목" />
        <ManagementPageTemplate
          description="월별 회비 현황을 확인합니다."
          filters={<FilterBar aria-label="회비 필터" />}
          kicker="월별 회비 현황"
          list={<section aria-label="회비 목록">목록</section>}
          summary={<section aria-label="회비 요약">요약</section>}
          title="회비 관리"
        />
      </PageTitleProvider>,
    );

    expect(screen.queryByText("월별 회비 현황")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "회비 관리" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "회비 요약" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "회비 필터" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "회비 목록" })).toBeInTheDocument();
  });

  it("renders form screens with a header and one or more panels", () => {
    render(
      <PageTitleProvider>
        <ShellPageTitle fallback="기본 제목" />
        <FormPageTemplate
          description="회원 기본 정보를 입력합니다."
          kicker="새 회원 추가"
          title="회원 등록"
        >
          <section aria-label="단건 등록">폼</section>
        </FormPageTemplate>
      </PageTitleProvider>,
    );

    expect(screen.queryByText("새 회원 추가")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "회원 등록" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "단건 등록" })).toBeInTheDocument();
  });
});
