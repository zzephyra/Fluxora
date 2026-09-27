import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Layers3, LogOut, UserRound } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { Button } from "../../components/ui/button";
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

export function AccountMenu() {
  const session = useSession();
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
        <DropdownMenuTrigger asChild>
          <Button aria-label="账户菜单" variant="outline">
            <UserRound aria-hidden className="size-4" />
            <span className="max-w-40 truncate">{session.data.email}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
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
