import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AppLoading from "./loading";

describe("AppLoading", () => {
  it("always exposes navigation progress to assistive technology", () => {
    render(<AppLoading />);

    expect(screen.getByRole("status")).toHaveTextContent("페이지를 불러오는 중입니다");
  });
});
