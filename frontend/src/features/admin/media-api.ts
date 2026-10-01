import type { components } from "../../api/schema";
import { apiRequest, ApiError } from "../../lib/api";
import { isRecord } from "../../lib/record";
import type { Filters } from "./operations-api";
export type MediaMode = "uploads" | "assets" | "exports";
type Upload = components["schemas"]["AdminUpload"];
type Asset = components["schemas"]["AdminAsset"];
type Render = components["schemas"]["AdminRender"];
export type MediaRow = {
  id: string;
  scopeId: string;
  ownerId: string;
  status: string;
  kind: string;
  source: string;
  size: number | null;
  createdAt: string;
  details: Record<string, string>;
  path: string;
  canCancel: boolean;
};
export const RENDER_STATUS = {
  queued: "排队中",
  running: "渲染中",
  succeeded: "已完成",
  failed: "失败",
  canceled: "已取消",
};
export const ASSET_STATUS = {
  uploading: "上传中",
  ready: "可用",
  failed: "失败",
  deleted: "已删除",
};
export const UPLOAD_STATUS = {
  pending: "待完成",
  uploaded: "已上传",
  failed: "失败",
  deleted: "已删除",
};
export const KIND_LABELS: Record<string, string> = {
  image: "图片",
  video: "视频",
  file: "文件",
  IMAGE: "图片",
  VIDEO: "视频",
  AUDIO: "音频",
  FILE: "文件",
};
const time = (v: string) =>
  new Date(v).toLocaleString("zh-CN", { hour12: false });
export const formatBytes = (v: number) =>
  v >= 1073741824
    ? `${(v / 1073741824).toFixed(2)} GiB`
    : v >= 1048576
      ? `${(v / 1048576).toFixed(2)} MiB`
      : v >= 1024
        ? `${(v / 1024).toFixed(1)} KiB`
        : `${v} B`;
function invalid(): never {
  throw new ApiError({
    status: 502,
    code: "invalid_response",
    message: "管理数据响应无效",
    details: {},
    requestId: null,
  });
}
const string = (v: unknown): v is string => typeof v === "string";
const integer = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const date = (v: unknown) => string(v) && Number.isFinite(Date.parse(v));
const nullableInteger = (v: unknown) => v === null || integer(v);
const member = (v: unknown, values: Record<string, string>) =>
  string(v) && Object.hasOwn(values, v);
function isUpload(v: unknown): v is Upload {
  return (
    isRecord(v) &&
    string(v.id) &&
    string(v.user_id) &&
    typeof v.category === "string" &&
    ["image", "video", "file"].includes(v.category) &&
    member(v.status, UPLOAD_STATUS) &&
    string(v.content_type) &&
    integer(v.size) &&
    date(v.created_at) &&
    date(v.updated_at)
  );
}
function isAsset(v: unknown): v is Asset {
  return (
    isRecord(v) &&
    [v.id, v.project_id, v.created_by, v.mime].every(string) &&
    typeof v.kind === "string" &&
    ["IMAGE", "VIDEO", "AUDIO", "FILE"].includes(v.kind) &&
    member(v.status, ASSET_STATUS) &&
    integer(v.size_bytes) &&
    nullableInteger(v.width) &&
    nullableInteger(v.height) &&
    typeof v.source === "string" &&
    ["generation", "editor", "other"].includes(v.source) &&
    date(v.created_at) &&
    date(v.updated_at)
  );
}
function isRender(v: unknown): v is Render {
  return (
    isRecord(v) &&
    [v.id, v.project_id, v.actor_id, v.document_id].every(string) &&
    member(v.status, RENDER_STATUS) &&
    [v.width, v.height, v.fps].every(nullableInteger) &&
    (v.duration_seconds === null ||
      (typeof v.duration_seconds === "number" &&
        Number.isFinite(v.duration_seconds) &&
        v.duration_seconds > 0)) &&
    (v.error_message === null || string(v.error_message)) &&
    date(v.created_at) &&
    date(v.updated_at) &&
    Array.isArray(v.allowed_actions) &&
    v.allowed_actions.every((x) => x === "cancel")
  );
}
export function parseMedia(mode: MediaMode, v: unknown): MediaRow {
  if (mode === "uploads") {
    if (!isUpload(v)) return invalid();
    return {
      id: v.id,
      scopeId: v.user_id,
      ownerId: v.user_id,
      status: v.status,
      kind: v.category,
      source: "用户上传",
      size: v.size,
      createdAt: v.created_at,
      path: `/api/v1/admin/users/${v.user_id}/uploads/${v.id}`,
      canCancel: false,
      details: {
        "文件 ID": v.id,
        所属用户: v.user_id,
        类型: KIND_LABELS[v.category],
        状态: UPLOAD_STATUS[v.status],
        MIME: v.content_type,
        登记大小: formatBytes(v.size),
        创建时间: time(v.created_at),
        更新时间: time(v.updated_at),
      },
    };
  }
  if (mode === "assets") {
    if (!isAsset(v)) return invalid();
    const source = {
      generation: "AI 生成",
      editor: "编辑器导出",
      other: "其他 / 未知",
    }[v.source];
    return {
      id: v.id,
      scopeId: v.project_id,
      ownerId: v.created_by,
      status: v.status,
      kind: v.kind,
      source,
      size: v.size_bytes,
      createdAt: v.created_at,
      path: `/api/v1/admin/projects/${v.project_id}/assets/${v.id}`,
      canCancel: false,
      details: {
        "资产 ID": v.id,
        所属项目: v.project_id,
        创建者: v.created_by,
        类型: KIND_LABELS[v.kind],
        来源: source,
        状态: ASSET_STATUS[v.status],
        MIME: v.mime,
        登记大小: formatBytes(v.size_bytes),
        分辨率: v.width && v.height ? `${v.width} × ${v.height}` : "暂无记录",
        创建时间: time(v.created_at),
        更新时间: time(v.updated_at),
      },
    };
  }
  if (!isRender(v)) return invalid();
  return {
    id: v.id,
    scopeId: v.project_id,
    ownerId: v.actor_id,
    status: v.status,
    kind: "video",
    source: "编辑器导出",
    size: null,
    createdAt: v.created_at,
    path: `/api/v1/admin/projects/${v.project_id}/editor-renders/${v.id}`,
    canCancel: v.allowed_actions.includes("cancel"),
    details: {
      "任务 ID": v.id,
      所属项目: v.project_id,
      发起人: v.actor_id,
      "工程 ID": v.document_id,
      状态: RENDER_STATUS[v.status],
      分辨率: v.width && v.height ? `${v.width} × ${v.height}` : "暂不可用",
      帧率: v.fps === null ? "暂不可用" : `${v.fps} fps`,
      时长:
        v.duration_seconds === null
          ? "暂不可用"
          : `${v.duration_seconds.toFixed(2)} 秒`,
      工程版本: "暂未记录快照版本",
      渲染耗时: "暂未记录精确耗时",
      创建时间: time(v.created_at),
      更新时间: time(v.updated_at),
      错误说明: v.error_message ?? "—",
    },
  };
}
export async function listMedia(
  mode: MediaMode,
  filters: Filters,
  page: number,
  signal?: AbortSignal,
): Promise<{ items: MediaRow[]; total: number; activeSize: number | null }> {
  const params = new URLSearchParams({
    offset: String(page * 20),
    limit: "20",
  });
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  const body = await apiRequest({
    path: `/api/v1/admin/${mode === "exports" ? "editor-renders" : mode}?${params}`,
    signal,
  });
  if (
    !isRecord(body) ||
    !Array.isArray(body.items) ||
    !integer(body.total) ||
    (mode !== "exports" && !integer(body.active_size_bytes))
  )
    return invalid();
  return {
    items: body.items.map((v) => parseMedia(mode, v)),
    total: body.total,
    activeSize:
      mode === "exports"
        ? null
        : integer(body.active_size_bytes)
          ? body.active_size_bytes
          : invalid(),
  };
}
export async function getMedia(
  mode: MediaMode,
  row: MediaRow,
  signal?: AbortSignal,
) {
  return parseMedia(mode, await apiRequest({ path: row.path, signal }));
}
export async function cancelRender(row: MediaRow) {
  return parseMedia(
    "exports",
    await apiRequest({
      path: `${row.path}/cancel`,
      method: "POST",
      csrf: true,
    }),
  );
}
