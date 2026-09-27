import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LoginShowcase } from "./login-showcase";

describe("LoginShowcase", () => {
  it("switches scenes and pauses after a manual choice", async () => {
    const user = userEvent.setup();
    render(<LoginShowcase />);
    await user.click(screen.getByRole("button", { name: "下一张场景" }));
    expect(screen.getByRole("heading", { name: /让未说完的故事/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "播放轮播" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "显示第 3 张场景" }));
    expect(screen.getByRole("heading", { name: /记住你的风格/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "下一张场景" }));
    expect(screen.getByRole("heading", { name: /每一个世界/ })).toBeInTheDocument();
  });
});
