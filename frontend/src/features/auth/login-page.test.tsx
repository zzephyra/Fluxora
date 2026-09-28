import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../lib/api";
import { getMe, login } from "./api";
import { LoginPage } from "./login-page";

vi.mock("./api", () => ({
  getMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  sessionQueryKey: ["auth", "session"],
}));

const authenticationError = new ApiError({
  status: 401,
  code: "authentication_error",
  message: "Authentication failed",
  details: {},
  requestId: "req-1",
});

function renderLogin() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Page({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(
    <Page>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route element={<LoginPage />} path="/login" />
          <Route element={<h1>工作台</h1>} path="/studio" />
        </Routes>
      </MemoryRouter>
    </Page>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.mocked(getMe).mockReset();
    vi.mocked(login).mockReset();
    vi.mocked(getMe).mockRejectedValue(authenticationError);
  });

  it("shows one message when the password is wrong", async () => {
    vi.mocked(login).mockRejectedValue(authenticationError);
    const user = userEvent.setup();
    renderLogin();

    await user.type(await screen.findByLabelText("邮箱"), "owner@example.com");
    await user.type(screen.getByLabelText("密码"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("邮箱或密码不正确");
    expect(screen.queryByText("Authentication failed")).not.toBeInTheDocument();
    expect(screen.queryByText("注册")).not.toBeInTheDocument();
  });

  it("keeps the user on the form when the email is empty", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(await screen.findByRole("button", { name: "登录" }));

    expect(screen.getByText("请输入有效邮箱")).toBeInTheDocument();
    expect(screen.getByText("请输入密码")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("toggles password visibility without submitting the form", async () => {
    const user = userEvent.setup();
    renderLogin();
    const input = await screen.findByLabelText("密码");
    await user.type(input, "secret-value");
    await user.click(screen.getByRole("button", { name: "显示密码" }));
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("secret-value");
    expect(login).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "隐藏密码" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("opens the workspace after login", async () => {
    vi.mocked(login).mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
      platform_admin: false,
    });
    const user = userEvent.setup();
    renderLogin();

    await user.type(await screen.findByLabelText("邮箱"), "owner@example.com");
    await user.type(screen.getByLabelText("密码"), "correct-horse");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("heading", { name: "工作台" })).toBeInTheDocument();
  });
});
