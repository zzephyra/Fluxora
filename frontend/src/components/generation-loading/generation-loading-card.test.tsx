import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GenerationLoadingCard } from "./generation-loading-card";

describe("GenerationLoadingCard", () => {
  it("shows the generating state without inventing a percentage", () => {
    render(<GenerationLoadingCard aspectRatio="16:9" status="generating" />);

    expect(screen.getByText("Generating")).toBeInTheDocument();
    expect(screen.getByText("正在生成图像")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("shows a real progress value only when one is provided", () => {
    render(<GenerationLoadingCard progress={36} status="generating" />);

    expect(screen.getByText("36%")).toBeInTheDocument();
  });

  it("shows a quiet failure and retries without a fake percentage", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<GenerationLoadingCard onRetry={onRetry} status="failed" />);

    expect(screen.getByText("Generation failed")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
