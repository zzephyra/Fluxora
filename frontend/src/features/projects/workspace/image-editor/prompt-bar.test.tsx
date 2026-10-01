import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { PromptBar } from "./prompt-bar";

it("explains missing selection and blocks enter, then enables generation after painting", async () => {
  const onSubmit = vi.fn();
  const props = { value: "去掉小人", busy: false, onChange: vi.fn(), onSubmit };
  const view = render(<PromptBar {...props} hasSelection={false} />);
  expect(screen.getByRole("button", { name: "生成" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("先用蒙版笔");
  fireEvent.submit(screen.getByRole("textbox").closest("form")!);
  expect(onSubmit).not.toHaveBeenCalled();
  view.rerender(<PromptBar {...props} hasSelection />);
  await userEvent.click(screen.getByRole("button", { name: "生成" }));
  expect(onSubmit).toHaveBeenCalledOnce();
});
