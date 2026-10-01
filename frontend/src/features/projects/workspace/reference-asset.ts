import type { UploadCategory } from "../../uploads";

export type ReferenceAsset = {
  id: string;
  name: string;
  url: string;
  size: number;
  category: UploadCategory;
};

export function referenceFromLocation(state: unknown): ReferenceAsset | null {
  if (typeof state !== "object" || state === null) {
    return null;
  }
  const value = readField(state, "referenceAsset");
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const id = readField(value, "id");
  const name = readField(value, "name");
  const url = readField(value, "url");
  const size = readField(value, "size");
  const category = readField(value, "category");
  if (typeof id !== "string" || id.length === 0 || typeof name !== "string" || name.length === 0) {
    return null;
  }
  if (typeof url !== "string" || !httpUrl(url)) {
    return null;
  }
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) {
    return null;
  }
  if (category !== "image" && category !== "video" && category !== "file") {
    return null;
  }
  return { id, name, url, size, category };
}

function readField(value: object, key: string): unknown {
  if (!Object.hasOwn(value, key)) {
    return undefined;
  }
  return Reflect.get(value, key);
}

function httpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
