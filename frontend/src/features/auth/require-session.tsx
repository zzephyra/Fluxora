import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { Navigate } from "react-router";

import { Button } from "../../components/ui/button";
import { isApiError, userFacingMessage } from "../../lib/api";
import { useSession } from "./use-session";

export function RequireSession({ children }: { children: ReactNode }) {
  const session = useSession();
  const queryClient = useQueryClient();
  const unauthorized = isApiError(session.error) && session.error.status === 401;

  useEffect(() => {
    if (!unauthorized) {
      return;
    }
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== "auth",
    });
  }, [queryClient, unauthorized]);

  if (session.isPending) {
    return (
      <p className="studio flex min-h-screen items-center justify-center gap-2 text-muted" role="status">
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
        正在确认登录状态
      </p>
    );
  }
  if (session.isSuccess) {
    return children;
  }
  if (unauthorized) {
    return <Navigate replace to="/login" />;
  }
  return (
    <main className="studio mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4">
      <p className="flex items-center gap-2 text-danger" role="alert">
        <CircleAlert aria-hidden className="size-4 shrink-0" />
        {userFacingMessage(session.error)}
      </p>
      <Button onClick={() => void session.refetch()} type="button">
        重试
      </Button>
    </main>
  );
}
