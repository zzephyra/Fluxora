import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
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
import { changeUser, listUsers, type AdminUser } from "./operations-api";
import {
  Confirmation,
  FilterSelect,
  Pagination,
  QueryMessage,
  formatTime,
} from "./operations-shared";

export function UsersScreen() {
  const session = useSession();
  const client = useQueryClient();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [target, setTarget] = useState<{
    row: AdminUser;
    action: "active" | "disabled" | "revoke";
  } | null>(null);
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["admin", "users", session.data?.id, search, status, page],
    queryFn: ({ signal }) => listUsers({ q: search, status }, page, signal),
    enabled: !!session.data,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: ({ row, action }: NonNullable<typeof target>) =>
      changeUser(row, action),
    onSuccess: async () => {
      setTarget(null);
      setNotice("操作成功，账户数据已更新");
      await client.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
  if (isApiError(query.error) && query.error.status === 404)
    return <Navigate replace to="/studio" />;
  return (
    <>
      <div className="admin-page-heading">
        <div>
          <h1>用户管理</h1>
          <p>管理创作者账号与会话，所有操作均记录审计。</p>
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
        className="admin-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q.trim());
          setPage(0);
        }}
      >
        <label className="admin-filter-field">
          <span>邮箱搜索</span>
          <Input
            value={q}
            maxLength={254}
            onChange={(e) => setQ(e.target.value)}
            placeholder="输入邮箱关键词"
          />
        </label>
        <FilterSelect
          label="账号状态"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(0);
          }}
          options={{ "": "全部状态", active: "正常", disabled: "已停用" }}
        />
        <Button type="submit">搜索</Button>
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
                  {["用户", "状态", "账号类型", "创建时间", "操作"].map((v) => (
                    <TableHead key={v}>{v}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <strong>{row.email}</strong>
                      <small className="admin-id">{row.id}</small>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`admin-module-status ${row.status === "active" ? "ready" : ""}`}
                      >
                        {row.status === "active" ? "正常" : "已停用"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {row.platform_admin ? "平台管理员" : "普通用户"}
                    </TableCell>
                    <TableCell>{formatTime(row.created_at)}</TableCell>
                    <TableCell>
                      {row.platform_admin || row.id === session.data?.id ? (
                        <span className="text-muted">受保护账号</span>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => {
                              mutation.reset();
                              setTarget({
                                row,
                                action:
                                  row.status === "active"
                                    ? "disabled"
                                    : "active",
                              });
                            }}
                          >
                            {row.status === "active" ? "停用" : "恢复"}
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              mutation.reset();
                              setTarget({ row, action: "revoke" });
                            }}
                          >
                            撤销会话
                          </Button>
                        </div>
                      )}
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
        平台管理员账号受保护。停用会立即撤销现有会话；恢复账号后需要重新登录。
      </p>
      {target && (
        <Confirmation
          title={`${target.action === "disabled" ? "停用账号" : target.action === "active" ? "恢复账号" : "撤销全部会话"}？`}
          description={`${target.row.email}：${target.action === "disabled" ? "将无法登录，已有会话立即失效。已经提交的生成任务仍按现有流程收尾。" : target.action === "active" ? "恢复登录资格，旧会话不会恢复。" : "当前所有登录会话将失效，用户需要重新登录。"}`}
          busy={mutation.isPending}
          error={mutation.error}
          close={() => setTarget(null)}
          confirm={() => mutation.mutate(target)}
        />
      )}
    </>
  );
}
