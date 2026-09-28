import { useQuery } from "@tanstack/react-query";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { Navigate } from "react-router";

import { Button } from "../../components/ui/button";
import { userFacingMessage } from "../../lib/api";
import { AppHeader } from "../auth";
import { ensurePersonalSpace, personalSpaceQueryKey } from "./api";

export function StudioEntry() {
  const space = useQuery({
    queryKey: personalSpaceQueryKey,
    queryFn: ({ signal }) => ensurePersonalSpace(signal),
    retry: false,
  });

  if (space.isSuccess) {
    return <Navigate replace to={`/projects/${space.data.id}`} />;
  }

  return (
    <div className="studio">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-[6%] py-16 md:px-[5%]">
        {space.isPending ? (
          <p className="flex items-center gap-2 text-muted" role="status">
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
            正在打开个人空间
          </p>
        ) : null}
        {space.isError ? (
          <section className="flex flex-col items-start gap-4 rounded-[14px] border border-line bg-panel p-8" role="alert">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-danger">
              <CircleAlert aria-hidden className="size-5" />
              无法打开个人空间
            </h1>
            <p className="text-muted">{userFacingMessage(space.error)}</p>
            <Button onClick={() => void space.refetch()} type="button" variant="outline">
              重试
            </Button>
          </section>
        ) : null}
      </main>
    </div>
  );
}
