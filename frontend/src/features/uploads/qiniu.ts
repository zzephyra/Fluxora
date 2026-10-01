import { QiniuError, QiniuNetworkError, QiniuRequestError, region, upload } from "qiniu-js";
import type { UploadProgress } from "./types";

type RegionCode = (typeof region)[keyof typeof region];

const HOST_REGION: Record<string, RegionCode> = {
  "upload.qiniup.com": region.z0,
  "up.qiniup.com": region.z0,
  "upload-z1.qiniup.com": region.z1,
  "up-z1.qiniup.com": region.z1,
  "upload-z2.qiniup.com": region.z2,
  "up-z2.qiniup.com": region.z2,
  "upload-na0.qiniup.com": region.na0,
  "upload-as0.qiniup.com": region.as0,
  "upload-cn-east-2.qiniup.com": region.cnEast2,
};

export class DirectUploadError extends Error {
  readonly reason: "token" | "network" | "provider" | "cancelled";

  constructor(reason: DirectUploadError["reason"], message: string) {
    super(message);
    this.name = "DirectUploadError";
    this.reason = reason;
  }
}

export function putFile(input: {
  file: File;
  key: string;
  token: string;
  uploadUrl: string;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
}): { done: Promise<void>; cancel: () => void } {
  let settled = false;
  let unsubscribe: () => void = () => undefined;
  let rejectSettled: (error: DirectUploadError) => void = () => undefined;
  const host = uploadHost(input.uploadUrl);
  const task = upload(
    input.file,
    input.key,
    input.token,
    { fname: input.file.name, mimeType: input.file.type || undefined },
    {
      useCdnDomain: true,
      forceDirect: false,
      chunkSize: 4,
      concurrentRequestLimit: 3,
      upprotocol: "https",
      uphost: host,
      region: HOST_REGION[host] ?? region.z2,
    },
  );
  let lastLoaded = 0;
  let lastAt = performance.now();
  const done = new Promise<void>((resolve, reject) => {
    rejectSettled = reject;
    const finish = (error?: DirectUploadError) => {
      if (settled) {
        return;
      }
      settled = true;
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const subscription = task.subscribe({
      next(progress) {
        const now = performance.now();
        const elapsed = Math.max((now - lastAt) / 1000, 0.001);
        const speed = Math.max(0, (progress.total.loaded - lastLoaded) / elapsed);
        lastLoaded = progress.total.loaded;
        lastAt = now;
        input.onProgress?.({
          percent: progress.total.percent,
          loaded: progress.total.loaded,
          size: progress.total.size,
          speed,
        });
      },
      error(error) {
        finish(classify(error));
      },
      complete() {
        finish();
      },
    });
    unsubscribe = () => subscription.unsubscribe();
    input.signal?.addEventListener("abort", () => {
      unsubscribe();
      finish(new DirectUploadError("cancelled", "Upload cancelled"));
    });
  });
  return {
    done,
    cancel() {
      unsubscribe();
      if (!settled) {
        settled = true;
        rejectSettled(new DirectUploadError("cancelled", "Upload cancelled"));
      }
    },
  };
}

function uploadHost(uploadUrl: string): string {
  const parsed = new URL(uploadUrl);
  return parsed.host;
}

function classify(error: QiniuError | QiniuRequestError | QiniuNetworkError): DirectUploadError {
  if (error instanceof QiniuNetworkError) {
    return new DirectUploadError("network", "Upload network failed");
  }
  if (error instanceof QiniuRequestError && (error.code === 401 || error.message.toLowerCase().includes("token"))) {
    return new DirectUploadError("token", "Upload token expired");
  }
  if (error instanceof QiniuError && error.name === "InvalidToken") {
    return new DirectUploadError("token", "Upload token expired");
  }
  return new DirectUploadError("provider", "Upload provider rejected the file");
}
