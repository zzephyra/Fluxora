import { useInfiniteQuery } from "@tanstack/react-query";
import { CircleAlert, FolderOpen, LoaderCircle, Plus, Shield, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { userFacingMessage } from "../../lib/api";
import { AppHeader } from "../auth";
import { listProjects, projectListQueryKey } from "./api";
import { CreateProjectDialog } from "./create-project-dialog";
import { formatUpdatedAt, roleLabel, type Project } from "./types";

export function ProjectsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const projects = useInfiniteQuery({
    queryKey: projectListQueryKey,
    queryFn: ({ pageParam, signal }) => listProjects(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor,
    retry: false,
  });
  const items = projects.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="studio">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-[6%] py-16 md:px-[5%]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] tracking-[2px] text-primary">WORKSPACE</p>
            <h1 className="mt-3 text-[clamp(32px,4vw,48px)] font-medium tracking-[-1.5px]">创作空间</h1>
          </div>
          <Button className="h-[50px] px-6" onClick={() => setCreateOpen(true)} type="button">
            <Plus aria-hidden className="size-4" />
            新建创作空间
          </Button>
        </div>
        {projects.isPending ? <ProjectListSkeleton /> : null}
        {projects.isError ? (
          <ErrorState message={userFacingMessage(projects.error)} onRetry={() => void projects.refetch()} />
        ) : null}
        {projects.isSuccess && items.length === 0 ? (
          <EmptyState onCreate={() => setCreateOpen(true)} />
        ) : null}
        {projects.isSuccess && items.length > 0 ? (
          <ProjectList
            hasNextPage={projects.hasNextPage}
            isFetchingNextPage={projects.isFetchingNextPage}
            items={items}
            onLoadMore={() => void projects.fetchNextPage()}
          />
        ) : null}
      </main>
      <CreateProjectDialog onOpenChange={setCreateOpen} open={createOpen} />
    </div>
  );
}

function ProjectListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div aria-hidden className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <p className="flex items-center gap-2 text-muted" role="status">
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
        正在加载创作空间
      </p>
    </div>
  );
}

export function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="flex flex-col items-start gap-4 rounded-[14px] border border-line bg-panel p-8">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <FolderOpen aria-hidden className="size-5 text-primary" />
        还没有创作空间
      </h2>
      <p className="text-muted">新建一个创作空间后，可以从这里进入。个人空间会在登录后自动准备。</p>
      <Button onClick={onCreate} type="button">
        <Plus aria-hidden className="size-4" />
        新建创作空间
      </Button>
    </section>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="flex flex-col items-start gap-4 rounded-[14px] border border-line bg-panel p-8" role="alert">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-danger">
        <CircleAlert aria-hidden className="size-5" />
        无法加载创作空间
      </h2>
      <p className="text-muted">{message}</p>
      <Button onClick={onRetry} type="button" variant="outline">
        重试
      </Button>
    </section>
  );
}

function ProjectList({
  items,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  items: Project[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid gap-4 md:grid-cols-2">
        {items.map((project) => (
          <li key={project.id}>
            <Link
              className="flex h-full flex-col gap-4 rounded-[14px] border border-line bg-panel p-5 transition-colors hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              to={`/projects/${project.id}`}
            >
              <span className="text-xl font-medium tracking-[-0.4px]">{project.kind === "personal" ? "个人空间" : project.name}</span>
              <span className="flex items-center gap-2 text-xs text-muted">
                {project.role === "OWNER" ? (
                  <Shield aria-hidden className="size-4" />
                ) : (
                  <Users aria-hidden className="size-4" />
                )}
                <span>{roleLabel(project.role)}</span>
                <span aria-hidden>·</span>
                {formatUpdatedAt(project.updated_at)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {hasNextPage ? (
        <Button disabled={isFetchingNextPage} onClick={onLoadMore} type="button" variant="outline">
          {isFetchingNextPage ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
          {isFetchingNextPage ? "正在加载" : "加载更多"}
        </Button>
      ) : null}
    </div>
  );
}
