import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../lib/api";
import { getMe } from "../auth/api";
import { createModelConfig, disableModelConfig, listModelAssignments, listModelConfigs } from "./api";
import { AssignmentScreen, CatalogScreen, ModelAdminPage } from "./model-admin-page";

vi.mock("./api", () => ({
  listModelConfigs: vi.fn(),
  listModelAssignments: vi.fn(),
  assignModel: vi.fn(),
  clearModelAssignment: vi.fn(),
  createModelConfig: vi.fn(),
  disableModelConfig: vi.fn(),
  modelAdminQueryKey: ["admin", "model-configs"],
  modelAssignmentQueryKey: ["admin", "model-assignments"],
}));

vi.mock("../auth/api", () => ({
  getMe: vi.fn(),
  logout: vi.fn(),
  sessionQueryKey: ["auth", "session"],
}));

function renderPage(path = "/admin/models") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<ModelAdminPage />} path="/admin">
            <Route element={<CatalogScreen />} path="models" />
            <Route element={<AssignmentScreen />} path="assignments" />
          </Route>
          <Route element={<h1>工作台</h1>} path="/studio" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("model admin page", () => {
  beforeEach(() => {
    vi.mocked(listModelConfigs).mockReset();
    vi.mocked(listModelAssignments).mockReset();
    vi.mocked(listModelAssignments).mockResolvedValue([]);
    vi.mocked(createModelConfig).mockReset();
    vi.mocked(disableModelConfig).mockReset();
    vi.mocked(getMe).mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
      platform_admin: true,
    });
  });

  it("treats a non-admin response as an unknown page", async () => {
    vi.mocked(listModelConfigs).mockRejectedValue(
      new ApiError({
        status: 404,
        code: "not_found",
        message: "Not found",
        details: {},
        requestId: null,
      }),
    );
    renderPage();
    expect(await screen.findByRole("heading", { name: "工作台" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "登记模型" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("密钥名称")).not.toBeInTheDocument();
  });

  it("submits only the catalog fields", async () => {
    vi.mocked(listModelConfigs).mockResolvedValue([]);
    vi.mocked(createModelConfig).mockResolvedValue({
      id: "config-1",
      provider: "openai",
      model_name: "gpt-4o",
      capability: "text_to_video",
      config_version: 1,
      parameters_schema: {},
      limits: {},
      secret_ref: "openai_api_key",
      enabled: true,
    });
    renderPage("/admin/models");
    expect(await screen.findByRole("heading", { name: "Models" })).toBeInTheDocument();
    expect(screen.queryByLabelText("供应商")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "登记模型" }));
    expect(await screen.findByRole("heading", { name: "登记模型" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("供应商"), "openai");
    await userEvent.type(screen.getByLabelText("模型名称"), "gpt-4o");
    await userEvent.click(screen.getByLabelText("能力"));
    await userEvent.click(screen.getByRole("menuitem", { name: "文生视频" }));
    await userEvent.type(screen.getByLabelText("密钥名称"), "openai_api_key");
    await userEvent.click(screen.getByRole("button", { name: "确认登记" }));
    await waitFor(() => expect(createModelConfig).toHaveBeenCalled());
    const payload = vi.mocked(createModelConfig).mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual([
      "capability",
      "limits",
      "model_name",
      "parameters_schema",
      "provider",
      "secret_ref",
    ]);
    expect(payload).not.toHaveProperty("api_key");
    expect(payload.secret_ref).toBe("openai_api_key");
  });

  it("disables a published config from the server list", async () => {
    vi.mocked(listModelConfigs).mockResolvedValue([
      {
        id: "config-1",
        provider: "openai",
        model_name: "gpt-4o",
        capability: "text_generation",
        config_version: 1,
        parameters_schema: {},
        limits: {},
        secret_ref: "openai_api_key",
        enabled: true,
      },
    ]);
    vi.mocked(disableModelConfig).mockResolvedValue({
      id: "config-1",
      provider: "openai",
      model_name: "gpt-4o",
      capability: "text_generation",
      config_version: 1,
      parameters_schema: {},
      limits: {},
      secret_ref: "openai_api_key",
      enabled: false,
    });
    renderPage("/admin/models");
    expect(await screen.findByRole("heading", { name: "Models" })).toBeInTheDocument();
    expect(screen.queryByLabelText("供应商")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "gpt-4o 版本 1 操作" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "停用 gpt-4o 版本 1" }));
    expect(disableModelConfig).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "确认停用" }));
    await waitFor(() => expect(disableModelConfig).toHaveBeenCalled());
    expect(vi.mocked(disableModelConfig).mock.calls[0][0]).toBe("config-1");
  });

  it("shows only models of the same capability in a business", async () => {
    vi.mocked(listModelConfigs).mockResolvedValue([
      {
        id: "text-1",
        provider: "qianwen",
        model_name: "qwen-plus",
        capability: "text_generation",
        config_version: 1,
        parameters_schema: {},
        limits: {},
        secret_ref: "qianwen",
        enabled: true,
      },
      {
        id: "video-1",
        provider: "qianwen",
        model_name: "video-a",
        capability: "text_to_video",
        config_version: 1,
        parameters_schema: {},
        limits: {},
        secret_ref: "qianwen",
        enabled: true,
      },
      {
        id: "video-2",
        provider: "qianwen",
        model_name: "video-b",
        capability: "text_to_video",
        config_version: 1,
        parameters_schema: {},
        limits: {},
        secret_ref: "qianwen",
        enabled: false,
      },
    ]);
    renderPage("/admin/assignments");
    expect(await screen.findByRole("heading", { name: "业务指定" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "登记模型" })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText("文生视频"));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["qianwen · video-a"]);
    await user.keyboard("{Escape}");
    await user.click(screen.getByLabelText("文本生成"));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["qianwen · qwen-plus"]);
  });

  it("filters the catalog by capability tag and model name", async () => {
    vi.mocked(listModelConfigs).mockResolvedValue([
      {
        id: "text-1",
        provider: "qianwen",
        model_name: "qwen-plus",
        capability: "text_generation",
        config_version: 1,
        parameters_schema: {},
        limits: {},
        secret_ref: "qianwen",
        enabled: true,
      },
      {
        id: "video-1",
        provider: "qianwen",
        model_name: "video-a",
        capability: "text_to_video",
        config_version: 1,
        parameters_schema: {},
        limits: {},
        secret_ref: "qianwen",
        enabled: true,
      },
    ]);
    renderPage("/admin/models");
    expect(await screen.findByText("qwen-plus")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("搜索模型名称"), "plus");
    expect(screen.getByText("qwen-plus")).toBeInTheDocument();
    expect(screen.queryByText("video-a")).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("搜索模型名称"));
    await userEvent.click(screen.getByRole("button", { name: "能力筛选" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "文生视频" }));
    expect(screen.getByText("video-a")).toBeInTheDocument();
    expect(screen.queryByText("qwen-plus")).not.toBeInTheDocument();
  });
  it("paginates and combines real provider and status filters", async () => {
    const configs = Array.from({ length: 12 }, (_, i) => ({
      id: `model-${i}`, provider: i < 10 ? "alpha" : "beta", model_name: `model-${i}`,
      capability: "text_generation", config_version: 1, parameters_schema: {}, limits: {},
      secret_ref: "server_key", enabled: i !== 11,
    }));
    vi.mocked(listModelConfigs).mockResolvedValue(configs);
    renderPage();
    await screen.findByRole("heading", { name: "Models" });
    const table = screen.getByRole("table", { name: "模型配置目录" });
    expect(within(table).getAllByRole("row")).toHaveLength(11);
    await userEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: "供应商筛选" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "beta" }));
    await userEvent.click(screen.getByRole("button", { name: "状态筛选" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "已停用" }));
    expect(within(table).getByText("model-11")).toBeInTheDocument();
    expect(within(table).queryByText("model-10")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(within(table).getAllByRole("row")).toHaveLength(11);
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
  });

  it("keeps advanced validation and sends no request for invalid JSON", async () => {
    vi.mocked(listModelConfigs).mockResolvedValue([]);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "登记模型" }));
    const form = screen.getByRole("dialog");
    expect(form.querySelector("details")).not.toHaveAttribute("open");
    await userEvent.type(screen.getByLabelText("供应商"), "openai");
    await userEvent.type(screen.getByLabelText("模型名称"), "example");
    await userEvent.type(screen.getByLabelText("密钥名称"), "server_key");
    await userEvent.click(screen.getByText("高级配置"));
    await userEvent.clear(screen.getByLabelText("参数说明"));
    await userEvent.type(screen.getByLabelText("参数说明"), "invalid");
    await userEvent.click(screen.getByRole("button", { name: "确认登记" }));
    expect(screen.getByText("参数说明必须是 JSON 对象")).toBeInTheDocument();
    expect(createModelConfig).not.toHaveBeenCalled();
    await userEvent.click(within(form).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a skeleton while loading and a retry after failure", async () => {
    vi.mocked(listModelConfigs).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("status", { name: "正在加载模型目录" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "登记模型" })).not.toBeInTheDocument();
  });

  it("retries a failed catalog request", async () => {
    vi.mocked(listModelConfigs).mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue([]);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "重试" }));
    expect(await screen.findByText("还没有登记模型")).toBeInTheDocument();
  });

  it("switches the admin theme and refreshes without changing data", async () => {
    vi.mocked(listModelConfigs).mockResolvedValue([]);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "切换至深色模式" }));
    expect(document.querySelector(".admin-shell")).toHaveAttribute("data-theme", "dark");
    await userEvent.click(screen.getByRole("button", { name: "刷新模型目录" }));
    await waitFor(() => expect(listModelConfigs).toHaveBeenCalledTimes(2));
    expect(createModelConfig).not.toHaveBeenCalled();
    expect(disableModelConfig).not.toHaveBeenCalled();
  });

  it("opens the mobile navigation as a keyboard-dismissable dialog", async () => {
    vi.mocked(listModelConfigs).mockResolvedValue([]);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "打开管理导航" }));
    expect(screen.getByRole("dialog", { name: "管理导航" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

});
