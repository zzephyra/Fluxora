import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GenerationPage } from "./generation-page";
import { createImageGeneration, getActiveImageModel, listImageGenerations } from "../image-generation";

vi.mock("../../video-editor", () => ({ EditVideoButton: () => null, RecentEdits: () => null }));

vi.mock("../image-generation", () => ({
  createImageGeneration: vi.fn(), getActiveImageModel: vi.fn(),
  listImageGenerations: vi.fn(), getImageGeneration: vi.fn(),
  assetContentPath: (project: string, asset: string) => `/assets/${project}/${asset}`,
}));
function Harness() {
  const [prompt, setPrompt] = useState("");
  const [type, setType] = useState<"video" | "image">("video");
  return <GenerationPage projectId="project-a" generationType={type} setGenerationType={setType} prompt={prompt} setPrompt={setPrompt} />;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listImageGenerations).mockResolvedValue([]);
  vi.mocked(getActiveImageModel).mockResolvedValue({ id: "model-a", provider: "example", model_name: "example" });
  vi.mocked(createImageGeneration).mockResolvedValue({ id: "task-a", status: "succeeded", prompt: "test", kind: "video", output_asset_ids: [], error: null, allowed_actions: [] });
});
describe("generation studio", () => {
  it("fills an example without submitting and preserves it until explicitly cleared", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "试用示例" }));
    expect((screen.getByRole("textbox", { name: /画面描述/ }) as HTMLTextAreaElement).value).toContain("旅人");
    expect(createImageGeneration).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "试用示例" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "清空画面描述" }));
    expect(screen.getByRole("textbox", { name: /画面描述/ })).toHaveValue("");
  });
  it("keeps the explicit video submission payload and supported parameters", async () => {
    render(<Harness />);
    expect(await screen.findByRole("button", { name: "5 秒" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "10 秒" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "9:16" }));
    await userEvent.type(screen.getByRole("textbox", { name: /画面描述/ }), "一片森林");
    await userEvent.click(screen.getByRole("button", { name: "生成视频" }));
    await waitFor(() => expect(createImageGeneration).toHaveBeenCalledWith("project-a", "一片森林", expect.any(String), { duration: 5, size: "1080*1920" }, "video"));
  });
  it("shows a carried reference and still submits the text prompt only", async () => {
    render(
      <GenerationPage
        generationType="video"
        onClearReference={() => undefined}
        projectId="project-a"
        prompt="一片森林"
        referenceAsset={{ id: "up-1", name: "fluxora.png", url: "https://cdn.example/fluxora.png", size: 2.5 * 1024 * 1024, category: "image" }}
        setGenerationType={() => undefined}
        setPrompt={() => undefined}
      />,
    );
    expect(screen.getByText("fluxora.png")).toBeInTheDocument();
    expect(screen.getByText("2.5 MB")).toBeInTheDocument();
    expect(screen.getByText(/不会把图片发给模型/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /添加参考图片/ })).toBeDisabled();
    await userEvent.click(await screen.findByRole("button", { name: "生成视频" }));
    await waitFor(() => expect(createImageGeneration).toHaveBeenCalledWith("project-a", "一片森林", expect.any(String), { duration: 5, size: "1920*1080" }, "video"));
  });
  it("does not offer unsupported upload or submit without an assigned model", async () => {
    vi.mocked(getActiveImageModel).mockResolvedValue(null);
    render(<Harness />);
    expect(screen.getByRole("button", { name: /添加参考图片/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "图片生成" }));
    expect(screen.getByRole("button", { name: "生成图片 · 暂未开放" })).toBeDisabled();
    expect(createImageGeneration).not.toHaveBeenCalled();
  });
});
