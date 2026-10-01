import { isRecord as record } from "../../lib/record";
import { apiRequest } from "../../lib/api";
import type { components } from "../../api/schema";
export type Composition = components["schemas"]["Composition"];
export type ClipData = components["schemas"]["Clip"];
export type EditorDocument = components["schemas"]["DocumentResponse"];
export type RenderTask = components["schemas"]["RenderResponse"];
export type Media = components["schemas"]["MediaResponse"];
const integer = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v);
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function isClip(v: unknown): v is ClipData {
  return (
    record(v) &&
    uuid(v.id) &&
    uuid(v.asset_id) &&
    integer(v.source_start_frame) &&
    integer(v.source_end_frame) &&
    integer(v.original_duration) &&
    integer(v.timeline_start_frame) &&
    integer(v.duration) &&
    v.source_start_frame >= 0 &&
    v.source_end_frame <= v.original_duration &&
    v.duration > 0 &&
    v.duration === v.source_end_frame - v.source_start_frame &&
    v.timeline_start_frame >= 0 &&
    typeof v.volume === "number" &&
    v.volume >= 0 &&
    v.volume <= 1 &&
    typeof v.muted === "boolean" &&
    v.speed === 1
  );
}
export function isComposition(v: unknown): v is Composition {
  return (
    record(v) &&
    v.schema_version === 1 &&
    v.fps === 30 &&
    integer(v.width) &&
    integer(v.height) &&
    integer(v.duration_in_frames) &&
    v.width >= 240 &&
    v.width <= 1920 &&
    v.height >= 240 &&
    v.height <= 1920 &&
    v.duration_in_frames > 0 &&
    v.duration_in_frames <= 18000 &&
    Array.isArray(v.tracks) &&
    v.tracks.length === 1 &&
    v.tracks.every(
      (t) =>
        record(t) &&
        t.id === "video" &&
        t.type === "video" &&
        Array.isArray(t.clips) &&
        t.clips.every(isClip),
    )
  );
}
function isDocument(v: unknown): v is EditorDocument {
  return (
    record(v) &&
    uuid(v.id) &&
    uuid(v.project_id) &&
    typeof v.title === "string" &&
    isComposition(v.composition) &&
    integer(v.version) &&
    typeof v.updated_at === "string"
  );
}
function isRender(v: unknown): v is RenderTask {
  return (
    record(v) &&
    uuid(v.id) &&
    uuid(v.document_id) &&
    typeof v.status === "string" &&
    ["queued", "running", "succeeded", "failed", "canceled"].includes(
      v.status,
    ) &&
    (v.output_asset_id === null || uuid(v.output_asset_id)) &&
    (v.error === null || typeof v.error === "string")
  );
}
function isMedia(v: unknown): v is Media {
  return (
    record(v) &&
    uuid(v.id) &&
    (v.width === null || integer(v.width)) &&
    (v.height === null || integer(v.height))
  );
}
function parse<T>(value: unknown, guard: (value: unknown) => value is T): T {
  if (!guard(value)) throw new Error("编辑器接口返回格式不正确");
  return value;
}
function page<T>(
  value: unknown,
  guard: (value: unknown) => value is T,
): { items: T[]; next_cursor: string | null } {
  if (!record(value) || !Array.isArray(value.items))
    throw new Error("素材列表格式不正确");
  return {
    items: value.items.map((v) => parse(v, guard)),
    next_cursor:
      typeof value.next_cursor === "string" ? value.next_cursor : null,
  };
}
const base = (id: string) => `/api/v1/projects/${id}/editor`;
export const mediaUrl = (projectId: string, assetId: string) =>
  `/api/v1/projects/${projectId}/assets/${assetId}/content`;
export const getDocument = async (
  projectId: string,
  id: string,
  signal?: AbortSignal,
) =>
  parse(
    await apiRequest({ path: `${base(projectId)}/documents/${id}`, signal }),
    isDocument,
  );
export const listDocuments = async (projectId: string, signal?: AbortSignal) =>
  page(
    await apiRequest({ path: `${base(projectId)}/documents`, signal }),
    isDocument,
  );
export const listMedia = async (projectId: string, signal?: AbortSignal) =>
  page(await apiRequest({ path: `${base(projectId)}/media`, signal }), isMedia);
export const createDocument = async (
  projectId: string,
  body: components["schemas"]["CreateDocument"],
) =>
  parse(
    await apiRequest({
      path: `${base(projectId)}/documents`,
      method: "POST",
      csrf: true,
      body,
    }),
    isDocument,
  );
export const saveDocument = async (
  projectId: string,
  id: string,
  body: components["schemas"]["SaveDocument"],
) =>
  parse(
    await apiRequest({
      path: `${base(projectId)}/documents/${id}`,
      method: "PATCH",
      csrf: true,
      body,
    }),
    isDocument,
  );
export const createRender = async (
  projectId: string,
  id: string,
  version: number,
  key: string,
) =>
  parse(
    await apiRequest({
      path: `${base(projectId)}/documents/${id}/renders`,
      method: "POST",
      csrf: true,
      body: { expected_version: version },
      headers: { "Idempotency-Key": key },
    }),
    isRender,
  );
export const getRender = async (
  projectId: string,
  id: string,
  signal?: AbortSignal,
) =>
  parse(
    await apiRequest({ path: `${base(projectId)}/renders/${id}`, signal }),
    isRender,
  );

export const getLatestRender = async (
  projectId: string,
  documentId: string,
  signal?: AbortSignal,
) => {
  const result = await apiRequest({
    path: `${base(projectId)}/documents/${documentId}/latest-render`,
    signal,
  });
  return result === null ? null : parse(result, isRender);
};

export function editorError(error: unknown): string {
  if (error instanceof Error && "status" in error) {
    if (error.status === 409)
      return "工程发生并发冲突或已有导出任务。请先导出工程 JSON 保留本地修改，再重新打开工程。";
    if (error.status === 404) return "工程或素材不存在，或当前账号已无权访问。";
    return "请求未完成，请稍后重试。";
  }
  return error instanceof Error ? error.message : "操作未完成，请重试。";
}
