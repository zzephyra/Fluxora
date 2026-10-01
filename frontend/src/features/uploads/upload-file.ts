import { isApiError } from "../../lib/api";
import { completeUpload, requestUploadToken } from "./api";
import { DirectUploadError, putFile } from "./qiniu";
import type { UploadOptions, UploadResult, UploadTask } from "./types";

const MAX_ATTEMPTS = 3;

export class UploadCancelled extends Error {
  readonly reason = "cancelled";

  constructor() {
    super("Upload cancelled");
    this.name = "UploadCancelled";
  }
}

export function uploadFile(file: File, options: UploadOptions): UploadTask {
  let cancelActive: () => void = () => undefined;
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const task = run(file, options, signal, (cancel) => {
    cancelActive = cancel;
  }) as UploadTask;
  task.cancel = () => {
    cancelActive();
    controller.abort();
  };
  return task;
}

async function run(
  file: File,
  options: UploadOptions,
  signal: AbortSignal,
  bindCancel: (cancel: () => void) => void,
): Promise<UploadResult> {
  let key: string | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    throwIfCancelled(signal);
    try {
      const token = await requestUploadToken({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
        category: options.category,
        key,
        signal,
      });
      key = token.key;
      const transfer = putFile({
        file,
        key: token.key,
        token: token.token,
        uploadUrl: token.upload_url,
        signal,
        onProgress: options.onProgress,
      });
      bindCancel(transfer.cancel);
      await transfer.done;
      throwIfCancelled(signal);
      const saved = await completeUpload(token.key, signal);
      return {
        id: saved.id,
        key: saved.key,
        url: saved.url,
        filename: saved.original_filename,
        size: saved.size,
        mimeType: saved.content_type,
      };
    } catch (error) {
      lastError = error;
      if (signal.aborted || (error instanceof DirectUploadError && error.reason === "cancelled")) {
        throw new UploadCancelled();
      }
      if (!canRetry(error) || attempt === MAX_ATTEMPTS) {
        throw error;
      }
      if (!(error instanceof DirectUploadError && error.reason === "token")) {
        key = undefined;
      }
      await delay(250 * 2 ** (attempt - 1), signal);
    }
  }
  throw lastError;
}

function canRetry(error: unknown): boolean {
  if (error instanceof DirectUploadError) {
    return error.reason === "token" || error.reason === "network";
  }
  return isApiError(error) && (error.code === "timeout" || error.code === "network_error");
}

function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new UploadCancelled();
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new UploadCancelled());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
