import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { isApiError } from "../../lib/api";
import { useSession } from "../auth";
import {
  Confirmation,
  FilterSelect,
  Pagination,
  QueryMessage,
  formatTime,
} from "./operations-shared";
import type { Filters } from "./operations-api";
import {
  ASSET_STATUS,
  UPLOAD_STATUS,
  RENDER_STATUS,
  KIND_LABELS,
  listMedia,
  getMedia,
  cancelRender,
  formatBytes,
  type MediaMode,
  type MediaRow,
} from "./media-api";

export function AssetsScreen() {
  const [mode, setMode] = useState<"uploads" | "assets">("uploads");
  return (
    <>
      <div className="admin-page-heading">
        <div>
          <h1>资产管理</h1>
          <p>盘点上传素材与项目作品，查看归属、状态与登记大小。</p>
        </div>
      </div>
      <div className="flex gap-2" role="group" aria-label="资产来源">
        <Button
          variant={mode === "uploads" ? "primary" : "outline"}
          aria-pressed={mode === "uploads"}
          onClick={() => setMode("uploads")}
        >
          用户上传
        </Button>
        <Button
          variant={mode === "assets" ? "primary" : "outline"}
          aria-pressed={mode === "assets"}
          onClick={() => setMode("assets")}
        >
          项目资产
        </Button>
      </div>
      <MediaInventory key={mode} mode={mode} />
    </>
  );
}
export function ExportsScreen() {
  return (
    <>
      <div className="admin-page-heading">
        <div>
          <h1>视频导出</h1>
          <p>查看编辑器渲染任务，追踪状态并取消尚未开始的导出。</p>
        </div>
      </div>
      <MediaInventory mode="exports" />
    </>
  );
}
function MediaInventory({ mode }: { mode: MediaMode }) {
  const session = useSession();
  const client = useQueryClient();
  const [draft, setDraft] = useState<Filters>({});
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<MediaRow | null>(null);
  const [target, setTarget] = useState<MediaRow | null>(null);
  const [notice, setNotice] = useState("");
  const exports = mode === "exports";
  const uploads = mode === "uploads";
  const statuses: Record<string, string> = exports
    ? RENDER_STATUS
    : uploads
      ? UPLOAD_STATUS
      : ASSET_STATUS;
  const query = useQuery({
    queryKey: ["admin", mode, session.data?.id, filters, page],
    queryFn: ({ signal }) => listMedia(mode, filters, page, signal),
    enabled: !!session.data,
    retry: false,
    refetchInterval: (q) => (exports && !q.state.error ? 10000 : false),
    refetchIntervalInBackground: false,
  });
  const mutation = useMutation({
    mutationFn: cancelRender,
    onSuccess: async () => {
      setTarget(null);
      setNotice("排队导出已取消");
      await client.invalidateQueries({ queryKey: ["admin", "exports"] });
    },
  });
  const set = (key: string, value: string) =>
    setDraft((old) => ({ ...old, [key]: value }));
  const idFields = uploads
    ? [
        ["file_id", "文件 ID"],
        ["user_id", "用户 ID"],
      ]
    : exports
      ? [
          ["render_id", "任务 ID"],
          ["project_id", "项目 ID"],
          ["actor_id", "发起人 ID"],
          ["document_id", "工程 ID"],
        ]
      : [
          ["asset_id", "资产 ID"],
          ["project_id", "项目 ID"],
          ["created_by", "创建者 ID"],
        ];
  if (isApiError(query.error) && query.error.status === 404)
    return <Navigate replace to="/studio" />;
  return (
    <>
      <form
        className="admin-ops-filters"
        onSubmit={(e) => {
          e.preventDefault();
          const next = { ...draft };
          for (const key of ["created_from", "created_to"])
            if (next[key]) next[key] = new Date(next[key]).toISOString();
          setFilters(next);
          setPage(0);
        }}
      >
        <FilterSelect
          label="状态筛选"
          value={draft.status ?? ""}
          onChange={(v) => set("status", v)}
          options={{ "": "全部状态", ...statuses }}
        />
        {!exports && (
          <FilterSelect
            label="文件类型"
            value={draft[uploads ? "category" : "kind"] ?? ""}
            onChange={(v) => set(uploads ? "category" : "kind", v)}
            options={
              uploads
                ? { "": "全部类型", image: "图片", video: "视频", file: "文件" }
                : {
                    "": "全部类型",
                    IMAGE: "图片",
                    VIDEO: "视频",
                    AUDIO: "音频",
                    FILE: "文件",
                  }
            }
          />
        )}
        <div className="flex gap-2">
          <Button type="submit">应用筛选</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDraft({});
              setFilters({});
              setPage(0);
            }}
          >
            重置
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            刷新
          </Button>
        </div>
        <details className="admin-ops-advanced">
          <summary>更多筛选：归属、编号与时间</summary>
          <div className="admin-ops-filters">
            {idFields.map(([key, label]) => (
              <label key={key} className="admin-filter-field">
                <span>{label}</span>
                <Input
                  value={draft[key] ?? ""}
                  onChange={(e) => set(key, e.target.value)}
                  placeholder="完整 UUID"
                  pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
                  title="请输入完整 UUID"
                />
              </label>
            ))}
            {[
              ["created_from", "开始时间"],
              ["created_to", "结束时间"],
            ].map(([key, label]) => (
              <label key={key} className="admin-filter-field">
                <span>{label}</span>
                <Input
                  type="datetime-local"
                  value={draft[key] ?? ""}
                  onChange={(e) => set(key, e.target.value)}
                />
              </label>
            ))}
          </div>
        </details>
      </form>
      {!exports && query.data && !query.error && (
        <div className="admin-media-summary">
          <span>
            当前筛选 <strong>{query.data.total}</strong> 条记录
          </span>
          <span>
            未删除记录登记大小{" "}
            <strong>{formatBytes(query.data.activeSize ?? 0)}</strong>
          </span>
          <p>根据数据库登记计算，含未完成上传；不代表存储实时容量或账单。</p>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      <QueryMessage
        pending={query.isPending}
        error={query.error}
        empty={query.data?.items.length === 0}
        retry={() => void query.refetch()}
      />
      {query.data && !query.error && (
        <>
          <div className="admin-ops-table">
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    exports ? "导出任务" : "资产编号",
                    uploads ? "所属用户" : "所属项目",
                    exports ? "规格" : "类型 / 来源",
                    "状态",
                    exports ? "创建时间" : "登记大小",
                    "操作",
                  ].map((v) => (
                    <TableHead key={v}>{v}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <code>{row.id}</code>
                      {!uploads && (
                        <small className="admin-id">用户 {row.ownerId}</small>
                      )}
                    </TableCell>
                    <TableCell>
                      <code>{row.scopeId}</code>
                    </TableCell>
                    <TableCell>
                      {exports ? (
                        <>
                          {row.details["分辨率"]}
                          <small className="admin-id">
                            {row.details["时长"]}
                          </small>
                        </>
                      ) : (
                        <>
                          {KIND_LABELS[row.kind]}
                          <small className="admin-id">{row.source}</small>
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`admin-module-status ${["ready", "uploaded", "succeeded"].includes(row.status) ? "ready" : ""}`}
                      >
                        {statuses[row.status]}
                      </span>
                    </TableCell>
                    <TableCell>
                      {exports
                        ? formatTime(row.createdAt)
                        : formatBytes(row.size ?? 0)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setSelected(row)}
                        >
                          详情
                        </Button>
                        {row.canCancel && (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              mutation.reset();
                              setTarget(row);
                            }}
                          >
                            取消导出
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination
            page={page}
            total={query.data.total}
            onChange={setPage}
            busy={query.isFetching}
          />
        </>
      )}
      <p className="admin-console-boundary">
        {exports
          ? "页面可见时每 10 秒刷新。仅排队任务可取消，不会中断运行中的渲染或重新导出。"
          : "此处仅展示资产元数据，不提供私有媒体预览、下载或删除。"}
      </p>
      {selected && (
        <MediaDetail
          key={selected.id}
          mode={mode}
          row={selected}
          identity={session.data?.id}
          close={() => setSelected(null)}
        />
      )}
      {target && (
        <Confirmation
          title="取消排队导出？"
          description={`任务 ${target.id}：取消后不再执行本次渲染，不会删除工程或素材。若 Worker 已开始处理，服务器将拒绝取消。`}
          busy={mutation.isPending}
          error={mutation.error}
          close={() => setTarget(null)}
          confirm={() => mutation.mutate(target)}
        />
      )}
    </>
  );
}
function MediaDetail({
  mode,
  row,
  identity,
  close,
}: {
  mode: MediaMode;
  row: MediaRow;
  identity: string | undefined;
  close: () => void;
}) {
  const query = useQuery({
    queryKey: ["admin", mode, identity, "detail", row.scopeId, row.id],
    queryFn: ({ signal }) => getMedia(mode, row, signal),
    retry: false,
    refetchInterval: (q) =>
      mode === "exports" &&
      !q.state.error &&
      (!q.state.data || ["queued", "running"].includes(q.state.data.status))
        ? 10000
        : false,
    refetchIntervalInBackground: false,
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="admin-surface admin-task-dialog">
        <DialogTitle className="text-lg font-semibold">
          {mode === "exports" ? "导出详情" : "资产详情"}
        </DialogTitle>
        <DialogDescription>
          仅显示运营元数据，不开放文件内容。
        </DialogDescription>
        <QueryMessage
          pending={query.isPending}
          error={query.error}
          empty={false}
          retry={() => void query.refetch()}
        />
        {query.data && !query.error && (
          <dl className="admin-task-details">
            {Object.entries(query.data.details).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}
