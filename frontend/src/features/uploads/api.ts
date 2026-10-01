import { apiRequest, ApiError } from "../../lib/api";
import { isRecord } from "../../lib/record";
import type { UploadCategory, UploadFileRecord, UploadLimits, UploadTokenResponse } from "./types";

export const uploadListQueryKey = ["uploads", "mine"] as const;

function invalidResponse(): ApiError {
  return new ApiError({
    status: 500,
    code: "invalid_response",
    message: "响应无法识别",
    details: {},
    requestId: null,
  });
}

function parseToken(value: unknown): UploadTokenResponse {
  if (
    !isRecord(value) ||
    typeof value.token !== "string" ||
    typeof value.key !== "string" ||
    typeof value.domain !== "string" ||
    typeof value.upload_url !== "string" ||
    typeof value.expires_in !== "number" ||
    "secret" in value ||
    "secret_key" in value
  ) {
    throw invalidResponse();
  }
  return {
    token: value.token,
    key: value.key,
    domain: value.domain,
    upload_url: value.upload_url,
    expires_in: value.expires_in,
  };
}

function parseFile(value: unknown): UploadFileRecord {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.key !== "string") {
    throw invalidResponse();
  }
  const status = uploadStatus(value.status);
  if (
    typeof value.url !== "string" ||
    typeof value.original_filename !== "string" ||
    typeof value.content_type !== "string" ||
    typeof value.size !== "number" ||
    (value.category !== "image" && value.category !== "video" && value.category !== "file") ||
    status === null ||
    value.provider !== "qiniu"
  ) {
    throw invalidResponse();
  }
  return {
    id: value.id,
    key: value.key,
    url: value.url,
    original_filename: value.original_filename,
    content_type: value.content_type,
    size: value.size,
    category: value.category,
    status,
    provider: "qiniu",
    created_at: typeof value.created_at === "string" ? value.created_at : "",
    updated_at: typeof value.updated_at === "string" ? value.updated_at : "",
  };
}

function uploadStatus(value: unknown): UploadFileRecord["status"] | null {
  if (value === "uploaded" || value === "pending" || value === "failed" || value === "deleted") {
    return value;
  }
  return null;
}

export async function requestUploadToken(input: {
  filename: string;
  contentType: string;
  size: number;
  category: UploadCategory;
  key?: string;
  signal?: AbortSignal;
}): Promise<UploadTokenResponse> {
  const body = await apiRequest({
    path: "/api/v1/uploads/token",
    method: "POST",
    csrf: true,
    signal: input.signal,
    body: {
      filename: input.filename,
      content_type: input.contentType,
      size: input.size,
      category: input.category,
      ...(input.key ? { key: input.key } : {}),
    },
  });
  return parseToken(body);
}

export async function completeUpload(key: string, signal?: AbortSignal): Promise<UploadFileRecord> {
  const body = await apiRequest({
    path: "/api/v1/uploads/complete",
    method: "POST",
    csrf: true,
    signal,
    body: { key },
  });
  return parseFile(body);
}

export async function listUploads(signal?: AbortSignal): Promise<{ items: UploadFileRecord[]; limits: UploadLimits }> {
  const body = await apiRequest({ path: "/api/v1/uploads", signal });
  if (!isRecord(body) || !Array.isArray(body.items) || !isRecord(body.limits)) {
    throw invalidResponse();
  }
  const limits = body.limits;
  if (typeof limits.image !== "number" || typeof limits.video !== "number" || typeof limits.file !== "number") {
    throw invalidResponse();
  }
  return {
    items: body.items.map(parseFile),
    limits: { image: limits.image, video: limits.video, file: limits.file },
  };
}

export async function deleteUpload(id: string): Promise<void> {
  await apiRequest({ path: `/api/v1/uploads/${id}`, method: "DELETE", csrf: true });
}
