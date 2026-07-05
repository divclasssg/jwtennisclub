import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActionLink } from "@/components/atoms";
import { FilterBar } from "@/components/molecules";
import { FormPageTemplate, ManagementPageTemplate } from ".";

describe("templates", () => {
  it("renders management screens in the expected order", () => {
    render(
      <ManagementPageTemplate
        action={<ActionLink href="/fees/new">CSV 등록</ActionLink>}
        description="월별 회비 현황을 확인합니다."
        filters={<FilterBar aria-label="회비 필터" />}
        kicker="회비 관리"
        list={<section aria-label="회비 목록">목록</section>}
        summary={<section aria-label="회비 요약">요약</section>}
        title="월별 회비 현황"
      />,
    );

    expect(screen.getByText("회비 관리")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "월별 회비 현황" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "회비 요약" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "회비 필터" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "회비 목록" })).toBeInTheDocument();
  });

  it("renders form screens with a header and one or more panels", () => {
    render(
      <FormPageTemplate
        description="회원 기본 정보를 입력합니다."
        kicker="회원 등록"
        title="새 회원 추가"
      >
        <section aria-label="단건 등록">폼</section>
      </FormPageTemplate>,
    );

    expect(screen.getByText("회원 등록")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "새 회원 추가" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "단건 등록" })).toBeInTheDocument();
  });
});
