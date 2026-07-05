import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ActionLink,
  Badge,
  Button,
  DateInput,
  SelectInput,
  TextArea,
  TextInput,
} from ".";

describe("atoms", () => {
  it("renders button variants as accessible buttons", () => {
    render(<Button variant="danger">삭제</Button>);

    expect(screen.getByRole("button", { name: "삭제" })).toBeInTheDocument();
  });

  it("renders action links with Next Link hrefs", () => {
    render(<ActionLink href="/members/new">회원 등록</ActionLink>);

    expect(screen.getByRole("link", { name: "회원 등록" })).toHaveAttribute(
      "href",
      "/members/new",
    );
  });

  it("renders badges with their text content", () => {
    render(<Badge tone="success">활동</Badge>);

    expect(screen.getByText("활동")).toBeInTheDocument();
  });

  it("renders form controls with forwarded attributes", () => {
    render(
      <>
        <label>
          이름
          <TextInput name="name" required />
        </label>
        <label>
          가입일
          <DateInput name="joinedDate" />
        </label>
        <label>
          상태
          <SelectInput name="status">
            <option value="active">활동</option>
          </SelectInput>
        </label>
        <label>
          메모
          <TextArea name="memo" rows={4} />
        </label>
      </>,
    );

    expect(screen.getByLabelText("이름")).toBeRequired();
    expect(screen.getByLabelText("가입일")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("상태")).toHaveValue("active");
    expect(screen.getByLabelText("메모")).toHaveAttribute("rows", "4");
  });
});
