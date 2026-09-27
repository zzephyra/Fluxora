import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../lib/api";
import { getMe } from "../auth/api";
import { RequireSession } from "../auth";
import { createProject, getProject, listProjects } from "./api";
import { ProjectEntryPage } from "./project-entry-page";
import { ProjectsPage } from "./projects-page";

vi.mock("../auth/api", () => ({
  getMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  sessionQueryKey: ["auth", "session"],
}));

vi.mock("./api", () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  getProject: vi.fn(),
  projectListQueryKey: ["projects", "list"],
  projectDetailQueryKey: (projectId: string) => ["projects", projectId, "detail"],
}));

const projectId = "11111111-1111-4111-8111-111111111111";

function renderAt(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<h1>登录</h1>} path="/login" />
          <Route
            element={
              <RequireSession>
                <ProjectsPage />
              </RequireSession>
            }
            path="/projects"
          />
          <Route
            element={
              <RequireSession>
                <ProjectEntryPage />
              </RequireSession>
            }
            path="/projects/:projectId/*"
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProjectsPage", () => {
  beforeEach(() => {
    vi.mocked(getMe).mockReset();
    vi.mocked(listProjects).mockReset();
    vi.mocked(getProject).mockReset();
    vi.mocked(createProject).mockReset();
    vi.mocked(getMe).mockResolvedValue({ id: "user-1", email: "owner@example.com" });
  });

  it("shows an empty project list", async () => {
    vi.mocked(listProjects).mockResolvedValue({ items: [], next_cursor: null });
    renderAt("/projects");

    expect(await screen.findByRole("heading", { name: "还没有项目" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "项目" })).toBeInTheDocument();
  });

  it("shows a project returned by the API", async () => {
    vi.mocked(listProjects).mockResolvedValue({
      items: [
        {
          id: projectId,
          name: "春季成片",
          role: "OWNER",
          version: 1,
          created_at: "2026-09-27T04:00:00Z",
          updated_at: "2026-09-27T04:00:00Z",
        },
      ],
      next_cursor: null,
    });
    renderAt("/projects");

    expect(await screen.findByRole("link", { name: /春季成片/ })).toHaveAttribute(
      "href",
      `/projects/${projectId}`,
    );
    expect(screen.getByText("所有者")).toBeInTheDocument();
  });

  it("opens only the project returned by create", async () => {
    const createdId = "22222222-2222-4222-8222-222222222222";
    vi.mocked(listProjects).mockResolvedValue({
      items: [
        {
          id: projectId,
          name: "春季成片",
          role: "OWNER",
          version: 1,
          created_at: "2026-09-27T04:00:00Z",
          updated_at: "2026-09-27T04:00:00Z",
        },
      ],
      next_cursor: null,
    });
    vi.mocked(createProject).mockResolvedValue({
      id: createdId,
      name: "新世界",
      role: "OWNER",
      version: 1,
      created_at: "2026-09-27T05:00:00Z",
      updated_at: "2026-09-27T05:00:00Z",
    });
    vi.mocked(getProject).mockImplementation(async (id: string) => {
      if (id !== createdId) {
        throw new Error("requested another project");
      }
      return {
        id: createdId,
        name: "新世界",
        role: "OWNER",
        version: 1,
        created_at: "2026-09-27T05:00:00Z",
        updated_at: "2026-09-27T05:00:00Z",
      };
    });
    const user = userEvent.setup();
    renderAt("/projects");

    await user.click((await screen.findAllByRole("button", { name: "新建项目" }))[0]);
    expect(screen.getByText(/不会从其他项目带过来/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("项目名称"), "新世界");
    await user.click(screen.getByRole("button", { name: "创建" }));

    expect(await screen.findByRole("link", { name: /新世界/ })).toBeInTheDocument();
    expect(screen.getByText(/这个项目和其他项目分开/)).toBeInTheDocument();
    expect(screen.queryByText("春季成片")).not.toBeInTheDocument();
    expect(createProject).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createProject).mock.calls[0]?.[0]).toBe("新世界");
  });

  it("shows an error and retries", async () => {
    vi.mocked(listProjects)
      .mockRejectedValueOnce(
        new ApiError({
          status: 503,
          code: "retrieval_unavailable",
          message: "down",
          details: {},
          requestId: "req-2",
        }),
      )
      .mockResolvedValueOnce({ items: [], next_cursor: null });
    const user = userEvent.setup();
    renderAt("/projects");

    expect(await screen.findByRole("heading", { name: "无法加载项目" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByRole("heading", { name: "还没有项目" })).toBeInTheDocument();
  });

  it("returns to the project list when the project does not exist", async () => {
    vi.mocked(getProject).mockRejectedValue(
      new ApiError({
        status: 404,
        code: "not_found",
        message: "not found",
        details: {},
        requestId: "req-3",
      }),
    );
    renderAt(`/projects/${projectId}`);

    expect(await screen.findByRole("heading", { name: "项目" })).toBeInTheDocument();
    expect(screen.queryByText("工作台尚未开放")).not.toBeInTheDocument();
  });

  it("opens the creative workspace without pretending chat is connected", async () => {
    vi.mocked(getProject).mockResolvedValue({
      id: projectId,
      name: "春季成片",
      role: "MEMBER",
      version: 1,
      created_at: "2026-09-27T04:00:00Z",
      updated_at: "2026-09-27T04:00:00Z",
    });
    renderAt(`/projects/${projectId}`);

    expect(await screen.findByRole("heading", { name: "你好，今天想创作什么？" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "创作需求" })).toBeInTheDocument();
    expect(screen.getByText(/对话服务接入中/)).toBeInTheDocument();
    expect(screen.getByText("成员")).toBeInTheDocument();
    expect(screen.queryByText("演示")).not.toBeInTheDocument();
  });
});
