import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api";
import { UsersScreen } from "./users-page";
import { TasksScreen } from "./tasks-page";
import {
  changeUser,
  listUsers,
  listTasks,
  getTask,
  cancelTask,
  type AdminUser,
  type AdminTask,
} from "./operations-api";
vi.mock("../auth", () => ({ useSession: () => ({ data: { id: "admin" } }) }));
vi.mock("./operations-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./operations-api")>()),
  changeUser: vi.fn(),
  listUsers: vi.fn(),
  listTasks: vi.fn(),
  getTask: vi.fn(),
  cancelTask: vi.fn(),
}));
const person: AdminUser = {
  id: "user",
  email: "creator@example.com",
  status: "active",
  platform_admin: false,
  created_at: "2026-09-28T00:00:00Z",
  updated_at: "2026-09-28T00:00:00Z",
};
const task: AdminTask = {
  id: "task",
  project_id: "project",
  actor_id: "user",
  kind: "video",
  status: "queued",
  provider: "example",
  phase: null,
  progress: null,
  model_config_id: "model",
  config_version: 1,
  reconciliation_required: false,
  error_code: null,
  error_message: null,
  created_at: person.created_at,
  updated_at: person.updated_at,
  started_at: null,
  finished_at: null,
  allowed_actions: ["cancel"],
};
function mount(page: "users" | "tasks") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/admin/${page}`]}>
        <Routes>
          <Route path="/admin/users" element={<UsersScreen />} />
          <Route path="/admin/tasks" element={<TasksScreen />} />
          <Route path="/studio" element={<h1>工作区</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listUsers).mockResolvedValue({
    items: [
      person,
      {
        ...person,
        id: "admin",
        email: "admin@example.com",
        platform_admin: true,
      },
    ],
    total: 2,
  });
  vi.mocked(listTasks).mockResolvedValue({ items: [task], total: 1 });
  vi.mocked(getTask).mockResolvedValue(task);
  vi.mocked(changeUser).mockResolvedValue({ ...person, status: "disabled" });
  vi.mocked(cancelTask).mockResolvedValue({
    ...task,
    status: "canceled",
    allowed_actions: [],
  });
});
it("protects admins and requires confirmation before disabling a user", async () => {
  mount("users");
  await screen.findByText(person.email);
  expect(screen.getByText("受保护账号")).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "停用" }),
  );
  expect(changeUser).not.toHaveBeenCalled();
  await userEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "确认操作",
    }),
  );
  await waitFor(() =>
    expect(changeUser).toHaveBeenCalledWith(person, "disabled"),
  );
  expect(
    await screen.findByText("操作成功，账户数据已更新"),
  ).toBeInTheDocument();
});
it("retains an operation conflict for the administrator to resolve", async () => {
  vi.mocked(changeUser).mockRejectedValue(
    new ApiError({
      status: 409,
      code: "version_conflict",
      message: "用户信息已变更",
      details: {},
      requestId: null,
    }),
  );
  mount("users");
  await screen.findByText(person.email);
  await userEvent.click(screen.getByRole("button", { name: "撤销会话" }));
  await userEvent.click(screen.getByRole("button", { name: "确认操作" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
});
it("filters user requests and renders errors with retry", async () => {
  mount("users");
  await screen.findByText(person.email);
  await userEvent.type(screen.getByLabelText("邮箱搜索"), "creator");
  await userEvent.click(screen.getByRole("button", { name: "搜索" }));
  await waitFor(() =>
    expect(listUsers).toHaveBeenLastCalledWith(
      { q: "creator", status: "" },
      0,
      expect.any(AbortSignal),
    ),
  );
});
it("shows task details and confirms cancellation", async () => {
  mount("tasks");
  await screen.findByText("task");
  await userEvent.click(screen.getByRole("button", { name: "详情" }));
  expect(await screen.findByText("供应商未提供")).toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  await userEvent.click(screen.getByRole("button", { name: "取消任务" }));
  expect(cancelTask).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "确认操作" }));
  await waitFor(() => expect(cancelTask).toHaveBeenCalled());
});
it("does not offer cancellation for running tasks", async () => {
  vi.mocked(listTasks).mockResolvedValue({
    items: [
      {
        ...task,
        status: "running",
        allowed_actions: [],
        reconciliation_required: true,
      },
    ],
    total: 1,
  });
  mount("tasks");
  expect(await screen.findByText("结果待核对")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "取消任务" }),
  ).not.toBeInTheDocument();
});
it("redirects when admin access is withdrawn", async () => {
  vi.mocked(listUsers).mockRejectedValue(
    new ApiError({
      status: 404,
      code: "not_found",
      message: "not found",
      details: {},
      requestId: null,
    }),
  );
  mount("users");
  expect(
    await screen.findByRole("heading", { name: "工作区" }),
  ).toBeInTheDocument();
});
