import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, CircleAlert, Layers3, LogOut, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Link, useMatch, useNavigate } from "react-router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { isAbortError, isApiError, userFacingMessage } from "../../lib/api";
import { logout } from "./api";
import { useSession } from "./use-session";

export function BrandLink() {
  return (
    <Link
      aria-label="Fluxora 首页"
      className="inline-flex items-center gap-2 text-[26px] font-semibold tracking-[-1.5px] text-ink"
      to="/"
    >
      <Layers3 aria-hidden className="text-primary" size={22} />
      fluxora
    </Link>
  );
}

export function AccountMark({ email, size = "md" }: { email: string; size?: "md" | "lg" }) {
  const initial = email.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={
        size === "lg"
          ? "grid size-16 place-items-center rounded-full border border-line bg-canvas text-xl text-ink"
          : "grid size-10 place-items-center rounded-full border border-line bg-canvas text-sm text-ink"
      }
    >
      {initial}
    </span>
  );
}

export function AccountMenu() {
  const session = useSession();
  const projectMatch = useMatch("/projects/:projectId/*");
  const profileTo = projectMatch?.params.projectId
    ? `/projects/${projectMatch.params.projectId}/profile`
    : null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const logoutMutation = useMutation({
    mutationFn: logout,
  });

  if (!session.data) {
    return null;
  }

  async function onLogout() {
    setError(null);
    try {
      await logoutMutation.mutateAsync();
    } catch (logoutError) {
      if (isAbortError(logoutError)) {
        return;
      }
      if (!(isApiError(logoutError) && logoutError.status === 401)) {
        setError(userFacingMessage(logoutError));
        return;
      }
    }
    queryClient.clear();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="账户菜单"
          className="grid size-10 cursor-pointer place-items-center rounded-full border border-line bg-panel text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {session.data.email.trim().charAt(0).toUpperCase() || "?"}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {profileTo ? (
            <DropdownMenuItem asChild className="h-auto items-center py-2">
              <Link to={profileTo}>
                <AccountMark email={session.data.email} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{session.data.email}</span>
                  <span className="text-xs text-muted">个人主页</span>
                </span>
                <ChevronRight aria-hidden className="size-4 text-muted" />
              </Link>
            </DropdownMenuItem>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2">
              <AccountMark email={session.data.email} />
              <span className="min-w-0 truncate text-sm text-ink">{session.data.email}</span>
            </div>
          )}
          {session.data.platform_admin ? (
            <DropdownMenuItem asChild>
              <Link to="/admin/models">
                <SlidersHorizontal aria-hidden className="size-4" />
                模型目录
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            disabled={logoutMutation.isPending}
            onSelect={() => void onLogout()}
          >
            <LogOut aria-hidden className="size-4" />
            {logoutMutation.isPending ? "正在退出" : "退出登录"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <p className="flex items-center gap-2 text-xs text-danger" role="alert">
          <CircleAlert aria-hidden className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AppHeader() {
  return (
    <header className="flex h-[72px] items-center justify-between gap-4 border-b border-line px-[6%] md:h-[88px] md:px-[5%]">
      <BrandLink />
      <AccountMenu />
    </header>
  );
}
