import type { UploadCategory } from "./types";

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;
export const FILE_MIME_TYPES = ["application/pdf", "text/plain", "application/zip", "application/json"] as const;

export const UPLOAD_ACCEPT = [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES, ...FILE_MIME_TYPES].join(",");

export function categoryForFile(file: File): UploadCategory | null {
  if ((IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "image";
  }
  if ((VIDEO_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "video";
  }
  if ((FILE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "file";
  }
  return null;
}

export function crossedWorkspaceBoundary(current: EventTarget, related: EventTarget | null): boolean {
  return !(related instanceof Node && current instanceof Node && current.contains(related));
}

export function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
