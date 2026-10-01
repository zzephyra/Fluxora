import type { components } from "../../api/schema";
import { apiRequest, ApiError } from "../../lib/api";
import { isRecord } from "../../lib/record";
export type AdminUser = components["schemas"]["AdminUser"];
export type AdminTask = components["schemas"]["AdminTask"];
export const TASK_STATUSES = {
  queued: "排队中",
  submitting: "提交中",
  running: "生成中",
  cancel_requested: "请求取消中",
  succeeded: "已完成",
  failed: "失败",
  canceled: "已取消",
};
export type Filters = Record<string, string>;
function invalid(): never {
  throw new ApiError({
    status: 502,
    code: "invalid_response",
    message: "管理数据响应无效",
    details: {},
    requestId: null,
  });
}
const date = (v: unknown): v is string =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
const nullableDate = (v: unknown) => v === null || date(v);
function user(v: unknown): AdminUser {
  if (
    !isRecord(v) ||
    typeof v.id !== "string" ||
    typeof v.email !== "string" ||
    (v.status !== "active" && v.status !== "disabled") ||
    typeof v.platform_admin !== "boolean" ||
    !date(v.created_at) ||
    !date(v.updated_at)
  )
    return invalid();
  return {
    id: v.id,
    email: v.email,
    status: v.status,
    platform_admin: v.platform_admin,
    created_at: v.created_at,
    updated_at: v.updated_at,
  };
}
function isTask(v: unknown): v is AdminTask {
  return (
    isRecord(v) &&
    [v.id, v.project_id, v.actor_id, v.model_config_id, v.provider].every(
      (x) => typeof x === "string",
    ) &&
    (v.kind === "image" || v.kind === "video") &&
    typeof v.status === "string" &&
    Object.hasOwn(TASK_STATUSES, v.status) &&
    (v.phase === null || typeof v.phase === "string") &&
    (v.progress === null ||
      (typeof v.progress === "number" &&
        v.progress >= 0 &&
        v.progress <= 100)) &&
    typeof v.config_version === "number" &&
    Number.isInteger(v.config_version) &&
    typeof v.reconciliation_required === "boolean" &&
    (v.error_code === null || typeof v.error_code === "string") &&
    (v.error_message === null || typeof v.error_message === "string") &&
    date(v.created_at) &&
    date(v.updated_at) &&
    nullableDate(v.started_at) &&
    nullableDate(v.finished_at) &&
    Array.isArray(v.allowed_actions) &&
    v.allowed_actions.every((x) => x === "cancel")
  );
}
function task(v: unknown): AdminTask {
  if (!isTask(v)) return invalid();
  return v;
}
async function list<T>(
  resource: string,
  filters: Filters,
  page: number,
  parse: (v: unknown) => T,
  signal?: AbortSignal,
): Promise<{ items: T[]; total: number }> {
  const params = new URLSearchParams({
    offset: String(page * 20),
    limit: "20",
  });
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  const body = await apiRequest({
    path: `/api/v1/admin/${resource}?${params}`,
    signal,
  });
  if (
    !isRecord(body) ||
    !Array.isArray(body.items) ||
    typeof body.total !== "number" ||
    !Number.isInteger(body.total) ||
    body.total < 0
  )
    return invalid();
  return { items: body.items.map(parse), total: body.total };
}
export const listUsers = (
  filters: Filters,
  page: number,
  signal?: AbortSignal,
) => list("users", filters, page, user, signal);
export const listTasks = (
  filters: Filters,
  page: number,
  signal?: AbortSignal,
) => list("generation-tasks", filters, page, task, signal);
export async function changeUser(
  row: AdminUser,
  action: "active" | "disabled" | "revoke",
) {
  return user(
    await apiRequest({
      path: `/api/v1/admin/users/${row.id}/${action === "revoke" ? "revoke-sessions" : "status"}`,
      method: action === "revoke" ? "POST" : "PATCH",
      csrf: true,
      body: {
        expected_updated_at: row.updated_at,
        ...(action === "revoke" ? {} : { status: action }),
      },
    }),
  );
}
export async function getTask(
  row: Pick<AdminTask, "id" | "project_id">,
  signal?: AbortSignal,
) {
  return task(
    await apiRequest({
      path: `/api/v1/admin/projects/${row.project_id}/generation-tasks/${row.id}`,
      signal,
    }),
  );
}
export async function cancelTask(row: AdminTask) {
  return task(
    await apiRequest({
      path: `/api/v1/admin/projects/${row.project_id}/generation-tasks/${row.id}/cancel`,
      method: "POST",
      csrf: true,
    }),
  );
}
