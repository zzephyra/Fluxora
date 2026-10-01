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
  cancelTask,
  getTask,
  listTasks,
  TASK_STATUSES,
  type AdminTask,
  type Filters,
} from "./operations-api";
import {
  Confirmation,
  FilterSelect,
  Pagination,
  QueryMessage,
  formatTime,
} from "./operations-shared";

export function TasksScreen() {
  const session = useSession();
  const client = useQueryClient();
  const [filters, setFilters] = useState<Filters>({});
  const [draft, setDraft] = useState<Filters>({});
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AdminTask | null>(null);
  const [target, setTarget] = useState<AdminTask | null>(null);
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["admin", "tasks", session.data?.id, filters, page],
    queryFn: ({ signal }) => listTasks(filters, page, signal),
    enabled: !!session.data,
    retry: false,
    refetchInterval: (query) => (query.state.error ? false : 10000),
    refetchIntervalInBackground: false,
  });
  const mutation = useMutation({
    mutationFn: cancelTask,
    onSuccess: async () => {
      setTarget(null);
      setNotice("取消操作已处理，列表已更新");
      await client.invalidateQueries({ queryKey: ["admin", "tasks"] });
    },
  });
  const set = (key: string, value: string) =>
    setDraft((v) => ({ ...v, [key]: value }));
  if (isApiError(query.error) && query.error.status === 404)
    return <Navigate replace to="/studio" />;
  return (
    <>
      <div className="admin-page-heading">
        <div>
          <h1>生成任务</h1>
          <p>全平台图片与视频任务 · 页面可见时每 10 秒刷新</p>
        </div>
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          刷新
        </Button>
      </div>
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
          label="任务类型"
          value={draft.kind ?? ""}
          onChange={(v) => set("kind", v)}
          options={{ "": "全部类型", image: "图片", video: "视频" }}
        />
        <FilterSelect
          label="任务状态"
          value={draft.status ?? ""}
          onChange={(v) => set("status", v)}
          options={{ "": "全部状态", ...TASK_STATUSES }}
        />
        <label className="admin-filter-field">
          <span>供应商</span>
          <Input
            value={draft.provider ?? ""}
            maxLength={64}
            onChange={(e) => set("provider", e.target.value)}
            placeholder="供应商名称（精确匹配）"
          />
        </label>
        <FilterSelect
          label="结果核对"
          value={draft.reconciliation_required ?? ""}
          onChange={(v) => set("reconciliation_required", v)}
          options={{ "": "全部任务", true: "需要核对", false: "无需核对" }}
        />
        <details className="admin-ops-advanced">
          <summary>更多筛选：任务、空间、用户与时间</summary>
          <div className="admin-ops-filters">
            {[
              ["task_id", "任务 ID"],
              ["project_id", "空间 ID"],
              ["actor_id", "发起人 ID"],
            ].map(([key, label]) => (
              <label className="admin-filter-field" key={key}>
                <span>{label}</span>
                <Input
                  value={draft[key] ?? ""}
                  pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
                  title="请输入完整 UUID"
                  onChange={(e) => set(key, e.target.value)}
                  placeholder="完整 UUID"
                />
              </label>
            ))}
            {[
              ["created_from", "开始时间"],
              ["created_to", "结束时间"],
            ].map(([key, label]) => (
              <label className="admin-filter-field" key={key}>
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
        </div>
      </form>
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
                  {["任务", "类型 / 供应商", "状态", "创建时间", "操作"].map(
                    (v) => (
                      <TableHead key={v}>{v}</TableHead>
                    ),
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <code>{row.id}</code>
                      <small className="admin-id">空间 {row.project_id}</small>
                    </TableCell>
                    <TableCell>
                      {row.kind === "video" ? "视频" : "图片"}
                      <small className="admin-id">{row.provider}</small>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`admin-module-status ${row.status === "succeeded" ? "ready" : ""}`}
                      >
                        {TASK_STATUSES[row.status]}
                      </span>
                      {row.reconciliation_required && (
                        <small className="admin-id text-danger">
                          结果待核对
                        </small>
                      )}
                    </TableCell>
                    <TableCell>{formatTime(row.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setSelected(row)}
                        >
                          详情
                        </Button>
                        {row.allowed_actions.includes("cancel") && (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              mutation.reset();
                              setTarget(row);
                            }}
                          >
                            取消任务
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
        当前供应商仅支持取消排队任务。这里不展示提示词或私有媒体，不会重新发起生成。
      </p>
      {selected && (
        <TaskDetail
          key={selected.id}
          task={selected}
          identity={session.data?.id}
          close={() => setSelected(null)}
        />
      )}
      {target && (
        <Confirmation
          title="取消生成任务？"
          description={`任务 ${target.id}：如果任务已经开始，服务器会拒绝取消。此操作不会删除已有作品。`}
          busy={mutation.isPending}
          error={mutation.error}
          close={() => setTarget(null)}
          confirm={() => mutation.mutate(target)}
        />
      )}
    </>
  );
}
function TaskDetail({
  task,
  identity,
  close,
}: {
  task: AdminTask;
  identity: string | undefined;
  close: () => void;
}) {
  const query = useQuery({
    queryKey: ["admin", "tasks", identity, "detail", task.project_id, task.id],
    queryFn: ({ signal }) => getTask(task, signal),
    retry: false,
    refetchInterval: (q) =>
      q.state.error ||
      (q.state.data &&
        ["succeeded", "failed", "canceled"].includes(q.state.data.status))
        ? false
        : 10000,
    refetchIntervalInBackground: false,
  });
  const row = query.data;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="admin-surface admin-task-dialog">
        <DialogTitle className="text-lg font-semibold">任务详情</DialogTitle>
        <DialogDescription>
          仅展示运营元数据，状态以数据库为准。
        </DialogDescription>
        <QueryMessage
          pending={query.isPending}
          error={query.error}
          empty={false}
          retry={() => void query.refetch()}
        />
        {row && !query.error && (
          <dl className="admin-task-details">
            {Object.entries({
              "任务 ID": row.id,
              "空间 ID": row.project_id,
              "发起人 ID": row.actor_id,
              任务类型: row.kind === "image" ? "图片" : "视频",
              状态: TASK_STATUSES[row.status],
              阶段: row.phase ?? "—",
              进度: row.progress === null ? "供应商未提供" : `${row.progress}%`,
              供应商: row.provider,
              模型配置: row.model_config_id,
              模型版本: row.config_version,
              待核对: row.reconciliation_required ? "是" : "否",
              创建时间: formatTime(row.created_at),
              开始时间: formatTime(row.started_at),
              结束时间: formatTime(row.finished_at),
              错误码: row.error_code ?? "—",
              错误说明: row.error_message ?? "—",
            }).map(([label, value]) => (
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
