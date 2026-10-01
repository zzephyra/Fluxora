export type UploadCategory = "image" | "video" | "file";

export type UploadStatus = "idle" | "preparing" | "uploading" | "success" | "error" | "cancelled";

export type UploadTokenResponse = {
  token: string;
  key: string;
  domain: string;
  upload_url: string;
  expires_in: number;
};

export type UploadFileRecord = {
  id: string;
  key: string;
  url: string;
  original_filename: string;
  content_type: string;
  size: number;
  category: UploadCategory;
  status: "pending" | "uploaded" | "failed" | "deleted";
  provider: "qiniu";
  created_at: string;
  updated_at: string;
};

export type UploadLimits = {
  image: number;
  video: number;
  file: number;
};

export type UploadResult = {
  id: string;
  key: string;
  url: string;
  filename: string;
  size: number;
  mimeType: string;
};

export type UploadProgress = {
  percent: number;
  loaded: number;
  size: number;
  speed: number;
};

export type UploadOptions = {
  category: UploadCategory;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
};

export type UploadTask = Promise<UploadResult> & {
  cancel: () => void;
};
