import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { GenerationAction, type ImageAction } from "./generation-action";
import { getEditorOptions, requestImageAction } from "../../image-edit";
import { getImageGeneration } from "../../image-generation";

vi.mock("../../image-edit", () => ({
  getEditorOptions: vi.fn(),
  requestImageAction: vi.fn(),
}));
vi.mock("../../image-generation", () => ({
  getImageGeneration: vi.fn(),
  assetContentPath: (p: string, a: string) => `/assets/${p}/${a}`,
}));
const queued = {
  id: "task-a",
  kind: "video" as const,
  status: "queued",
  prompt: "镜头推进",
  output_asset_ids: [],
  error: null,
  allowed_actions: ["cancel"],
};
const input: ImageAction = {
  image: new Blob(["image"]),
  kind: "video",
  prompt: "镜头推进",
};
function mount(value = input, onResult = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GenerationAction
        projectId="project-a"
        input={value}
        onClose={vi.fn()}
        onResult={onResult}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    }),
  );
  vi.mocked(getEditorOptions).mockResolvedValue([
    {
      capability: "image_to_video",
      available: true,
      reason: null,
      model_name: "wan2.2-i2v-flash",
      resolutions: ["480P", "720P"],
      duration: 5,
    },
    {
      capability: "image_inpaint",
      available: true,
      reason: null,
      model_name: "gpt-image-1",
      resolutions: [],
      duration: null,
    },
  ]);
  vi.mocked(requestImageAction).mockResolvedValue(queued);
  vi.mocked(getImageGeneration).mockResolvedValue(queued);
});
it("previews without generating and submits server-supported video parameters", async () => {
  mount();
  await screen.findByText(/wan2.2/);
  expect(requestImageAction).not.toHaveBeenCalled();
  await userEvent.selectOptions(screen.getByLabelText("视频清晰度"), "720P");
  await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
  await screen.findByText("排队中");
  expect(requestImageAction).toHaveBeenCalledWith(
    "project-a",
    expect.objectContaining({
      image: input.image,
      prompt: "镜头推进",
      resolution: "720P",
      kind: "video",
    }),
    expect.objectContaining({
      inputId: expect.any(String),
      key: expect.any(String),
    }),
    expect.any(AbortSignal),
  );
});
it("keeps the same request identity after a network error", async () => {
  vi.mocked(requestImageAction)
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValueOnce(queued);
  mount();
  await screen.findByText(/wan2.2/);
  await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
  await userEvent.click(
    await screen.findByRole("button", { name: "重试本次提交" }),
  );
  await waitFor(() => expect(requestImageAction).toHaveBeenCalledTimes(2));
  expect(vi.mocked(requestImageAction).mock.calls[0]?.slice(0, 3)).toEqual(
    vi.mocked(requestImageAction).mock.calls[1]?.slice(0, 3),
  );
});
it("shows unavailable configuration and cannot submit", async () => {
  vi.mocked(getEditorOptions).mockResolvedValue([
    {
      capability: "image_to_video",
      available: false,
      reason: "尚未指定模型",
      model_name: null,
      resolutions: [],
      duration: null,
    },
  ]);
  mount();
  await screen.findByText("尚未指定模型");
  expect(screen.getByRole("button", { name: "确认生成" })).toBeDisabled();
});
it("displays a real completed inpaint result and allows continuing with it", async () => {
  const result = {
    ...queued,
    kind: "image" as const,
    status: "succeeded",
    output_asset_ids: ["new-image"],
    allowed_actions: [],
  };
  vi.mocked(requestImageAction).mockResolvedValue(result);
  vi.mocked(getImageGeneration).mockResolvedValue(result);
  const onResult = vi.fn();
  mount({ ...input, kind: "image", mask: new Blob(["mask"]) }, onResult);
  await screen.findByText(/gpt-image-1/);
  await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
  expect(await screen.findByAltText("重绘结果")).toHaveAttribute(
    "src",
    "/assets/project-a/new-image",
  );
  await userEvent.click(screen.getByRole("button", { name: "使用重绘结果" }));
  expect(onResult).toHaveBeenCalledWith(result);
});
it("aborts submissions when leaving the current image", async () => {
  vi.mocked(requestImageAction).mockImplementation(
    () => new Promise(() => undefined),
  );
  const view = mount();
  await screen.findByText(/wan2.2/);
  await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
  const signal = vi.mocked(requestImageAction).mock.calls[0]?.[3];
  view.unmount();
  expect(signal?.aborted).toBe(true);
});

it("explains oversized canvas before submitting", async () => {
  const image = new Blob([new Uint8Array(80 * 1024 * 1024 + 1)]);
  mount({ ...input, image, kind: "image", mask: new Blob(["mask"]) });
  await screen.findByText(/gpt-image-1/);
  expect(screen.getByRole("alert")).toHaveTextContent("当前画布导出后超过 80 MB");
  expect(screen.getByRole("button", { name: "确认生成" })).toBeDisabled();
  expect(requestImageAction).not.toHaveBeenCalled();
});
it("preserves a local read error instead of masking it", async () => {
  vi.mocked(requestImageAction).mockRejectedValueOnce(new Error("图片读取失败"));
  mount();
  await screen.findByText(/wan2.2/);
  await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("图片读取失败");
});

it("allows an inpaint canvas larger than 8 MiB to reach the server", async () => {
  mount({ ...input, kind: "image", image: new Blob([new Uint8Array(9 * 1024 * 1024)]), mask: new Blob(["mask"]) });
  await screen.findByText(/gpt-image-1/);
  await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
  await waitFor(() => expect(requestImageAction).toHaveBeenCalledTimes(1));
});
