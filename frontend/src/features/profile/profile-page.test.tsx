import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMe } from "../auth/api";
import { ProfilePage } from "./profile-page";

vi.mock("../auth/api", () => ({
  getMe: vi.fn(),
  logout: vi.fn(),
  sessionQueryKey: ["auth", "session"],
}));

const projectId = "11111111-1111-4111-8111-111111111111";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProfilePage projectId={projectId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.mocked(getMe).mockReset();
    vi.mocked(getMe).mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
      platform_admin: true,
    });
  });

  it("shows the account and an empty image area instead of generated pictures", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "owner@example.com" })).toBeInTheDocument();
    expect(screen.queryByText("平台管理员")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "还没有图片作品" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "去创作" })).toHaveAttribute("href", `/projects/${projectId}`);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "视频作品尚未开放" })).not.toBeInTheDocument();
  });

  it("keeps video on its own tab", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("tab", { name: "视频" }));
    expect(screen.getByRole("heading", { name: "视频作品尚未开放" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "还没有图片作品" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "去创作" })).not.toBeInTheDocument();
  });
});
