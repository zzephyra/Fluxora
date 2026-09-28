import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { heroShiftPx, LandingPage } from "./landing-page";
afterEach(cleanup);
const setup = () => { const user = userEvent.setup(); render(<MemoryRouter><LandingPage /></MemoryRouter>); return user; };
describe("hero background shift", () => {
  it("stays within a small horizontal range", () => {
    expect(heroShiftPx(500, 0, 1000)).toBe(0);
    expect(heroShiftPx(0, 0, 1000)).toBe(-12);
    expect(heroShiftPx(1000, 0, 1000)).toBe(12);
    expect(heroShiftPx(-40, 0, 1000)).toBe(-12);
  });
});

describe("public landing experience", () => {
  it("filters cards and opens an explicitly labeled reference", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: /^品牌概念$/ }));
    expect(screen.queryByRole("heading", { name: "彼方，另一颗太阳" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /自然，不止一种形态/ }));
    expect(within(screen.getByRole("dialog")).getByText(/此素材不是实时生成结果/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("switches workflow context", async () => {
    const user = setup();
    await user.click(screen.getByRole("tab", { name: /让项目记住风格/ }));
    expect(screen.getByRole("tab", { name: /让项目记住风格/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/这可以保存为项目记忆/)).toBeInTheDocument();
  });
  it("previews a local draft without claiming persistence", async () => {
    const user = setup();
    await user.type(screen.getByLabelText("描述你的创作灵感"), "一只鲸鱼游过云层");
    await user.click(screen.getByRole("button", { name: "整理灵感" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("一只鲸鱼游过云层")).toBeInTheDocument();
    expect(within(dialog).getByText(/刷新后不会保存/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /进入创作空间/ })).toHaveAttribute("href", "/studio");
  });
});
