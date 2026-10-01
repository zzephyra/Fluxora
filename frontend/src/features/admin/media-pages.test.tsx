import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { AssetsScreen, ExportsScreen } from "./media-pages";
import {
  listMedia,
  getMedia,
  cancelRender,
  parseMedia,
  type MediaRow,
} from "./media-api";
vi.mock("../auth", () => ({ useSession: () => ({ data: { id: "admin" } }) }));
vi.mock("./media-api", async (original) => ({
  ...(await original<typeof import("./media-api")>()),
  listMedia: vi.fn(),
  getMedia: vi.fn(),
  cancelRender: vi.fn(),
}));
const row: MediaRow = {
  id: "media-id",
  scopeId: "owner-id",
  ownerId: "owner-id",
  status: "uploaded",
  kind: "image",
  source: "用户上传",
  size: 100,
  createdAt: "2026-09-29T00:00:00Z",
  path: "/api/v1/admin/users/owner-id/uploads/media-id",
  canCancel: false,
  details: { "文件 ID": "media-id", 所属用户: "owner-id" },
};
function mount(exports = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        {exports ? <ExportsScreen /> : <AssetsScreen />}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listMedia).mockResolvedValue({
    items: [row],
    total: 1,
    activeSize: 100,
  });
  vi.mocked(getMedia).mockResolvedValue(row);
  vi.mocked(cancelRender).mockResolvedValue({ ...row, status: "canceled" });
});
it("separates user uploads from project inventory and resets filters", async () => {
  mount();
  await screen.findByText("media-id");
  expect(
    screen.queryByRole("button", { name: "下载" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "删除" }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "项目资产" }));
  await waitFor(() =>
    expect(listMedia).toHaveBeenLastCalledWith(
      "assets",
      {},
      0,
      expect.any(AbortSignal),
    ),
  );
  expect(screen.getByRole("button", { name: "项目资产" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
it("fetches scoped details rather than fabricating a preview", async () => {
  mount();
  await screen.findByText("media-id");
  await userEvent.click(screen.getByRole("button", { name: "详情" }));
  expect(await within(screen.getByRole("dialog")).findByText("所属用户")).toBeInTheDocument();
  expect(getMedia).toHaveBeenCalledWith(
    "uploads",
    row,
    expect.any(AbortSignal),
  );
});
it("confirms queue cancellation and refreshes exports", async () => {
  const queued = {
    ...row,
    status: "queued",
    kind: "video",
    canCancel: true,
    details: { 分辨率: "1280 × 720", 时长: "2.00 秒" },
  };
  vi.mocked(listMedia).mockResolvedValue({
    items: [queued],
    total: 1,
    activeSize: null,
  });
  mount(true);
  await screen.findByText("media-id");
  await userEvent.click(screen.getByRole("button", { name: "取消导出" }));
  expect(cancelRender).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "确认操作" }));
  expect(await screen.findByText("排队导出已取消")).toBeInTheDocument();
  expect(cancelRender).toHaveBeenCalledWith(queued, expect.anything());
});
it("does not offer cancellation for a running render", async () => {
  vi.mocked(listMedia).mockResolvedValue({
    items: [{ ...row, status: "running", canCancel: false }],
    total: 1,
    activeSize: null,
  });
  mount(true);
  expect(await screen.findByText("渲染中")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "取消导出" }),
  ).not.toBeInTheDocument();
});
it("shows fetch failure and allows retry", async () => {
  vi.mocked(listMedia).mockRejectedValueOnce(new Error("network"));
  mount();
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(await screen.findByText("media-id")).toBeInTheDocument();
});
it("rejects malformed metadata and excludes private source properties", () => {
  expect(() => parseMedia("uploads", { id: "broken" })).toThrow();
  const parsed = parseMedia("uploads", {
    id: "id",
    user_id: "user",
    category: "image",
    status: "uploaded",
    size: 100,
    content_type: "image/png",
    created_at: row.createdAt,
    updated_at: row.createdAt,
    url: "PRIVATE",
    object_key: "PRIVATE",
    original_filename: "PRIVATE",
  });
  expect(JSON.stringify(parsed)).not.toContain("PRIVATE");
});
