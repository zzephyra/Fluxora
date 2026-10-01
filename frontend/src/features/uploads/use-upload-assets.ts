import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { isApiError } from "../../lib/api";
import { deleteUpload, listUploads, uploadListQueryKey } from "./api";
import { DirectUploadError } from "./qiniu";
import type { UploadCategory, UploadFileRecord, UploadStatus, UploadTask } from "./types";
import { categoryForFile } from "./upload-config";
import { UploadCancelled, uploadFile } from "./upload-file";

export type AssetUploadPhase = "idle" | "check" | "fade" | "ready";

export type AssetUploadItem = {
  localId: string;
  file: File;
  category: UploadCategory;
  status: UploadStatus;
  percent: number;
  message: string;
  record: UploadFileRecord | null;
  task: UploadTask | null;
  phase: AssetUploadPhase;
};

export type UploadNotice = {
  message: string;
  tone: "success" | "danger";
};

const CHECK_MS = 650;
const REVEAL_MS = 950;

export function useUploadAssets() {
  const queryClient = useQueryClient();
  const saved = useQuery({
    queryKey: uploadListQueryKey,
    queryFn: ({ signal }) => listUploads(signal),
    retry: false,
  });
  const [items, setItems] = useState<AssetUploadItem[]>([]);
  const [notice, setNotice] = useState<UploadNotice | null>(null);
  const itemsRef = useRef(items);
  const attempts = useRef(new Map<string, number>());
  const timers = useRef(new Map<string, number[]>());
  itemsRef.current = items;

  const patch = useCallback((localId: string, next: Partial<AssetUploadItem>) => {
    setItems((current) => current.map((row) => (row.localId === localId ? { ...row, ...next } : row)));
  }, []);

  const notify = useCallback((message: string, tone: UploadNotice["tone"] = "danger") => {
    setNotice({ message, tone });
    window.setTimeout(() => {
      setNotice((current) => (current?.message === message ? null : current));
    }, 2400);
  }, []);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: uploadListQueryKey });
  }, [queryClient]);

  const clearReveal = useCallback((localId: string) => {
    for (const id of timers.current.get(localId) ?? []) {
      window.clearTimeout(id);
    }
    timers.current.delete(localId);
  }, []);

  const scheduleReveal = useCallback(
    (localId: string) => {
      clearReveal(localId);
      const check = window.setTimeout(() => patch(localId, { phase: "fade" }), CHECK_MS);
      const done = window.setTimeout(() => patch(localId, { phase: "ready" }), REVEAL_MS);
      timers.current.set(localId, [check, done]);
    },
    [clearReveal, patch],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const ids of pending.values()) {
        for (const id of ids) {
          window.clearTimeout(id);
        }
      }
      pending.clear();
    };
  }, []);

  const nextAttempt = useCallback((localId: string) => {
    const token = (attempts.current.get(localId) ?? 0) + 1;
    attempts.current.set(localId, token);
    return token;
  }, []);

  const currentAttempt = useCallback((localId: string, token: number) => {
    return attempts.current.get(localId) === token;
  }, []);

  const startOne = useCallback(
    (file: File, existingId?: string): AssetUploadItem => {
      const localId = existingId ?? crypto.randomUUID();
      const token = nextAttempt(localId);
      clearReveal(localId);
      const category = categoryForFile(file);
      const retried = existingId !== undefined;
      const item: AssetUploadItem = {
        localId,
        file,
        category: category ?? "file",
        status: "preparing",
        percent: 0,
        message: "",
        record: null,
        task: null,
        phase: "idle",
      };
      if (!category) {
        const message = "文件格式不支持";
        notify(message);
        return { ...item, status: "error", message };
      }
      const limit = saved.data?.limits[category];
      if (limit !== undefined && file.size > limit) {
        const message = "文件超过大小限制";
        notify(message);
        return { ...item, status: "error", message };
      }
      const task = uploadFile(file, {
        category,
        onProgress(progress) {
          if (!currentAttempt(localId, token)) {
            return;
          }
          patch(localId, { status: "uploading", percent: progress.percent, message: "" });
        },
      });
      item.task = task;
      void task
        .then((result) => {
          if (!currentAttempt(localId, token)) {
            return;
          }
          patch(localId, {
            status: "success",
            percent: 100,
            message: "",
            phase: "check",
            record: {
              id: result.id,
              key: result.key,
              url: result.url,
              original_filename: result.filename,
              content_type: result.mimeType,
              size: result.size,
              category,
              status: "uploaded",
              provider: "qiniu",
              created_at: "",
              updated_at: "",
            },
          });
          scheduleReveal(localId);
          notify(retried ? "重新上传成功" : "上传成功", "success");
          refresh();
        })
        .catch((error: unknown) => {
          if (!currentAttempt(localId, token)) {
            return;
          }
          if (error instanceof UploadCancelled) {
            patch(localId, { status: "cancelled", message: "已取消上传" });
            return;
          }
          const message = failureMessage(error);
          patch(localId, { status: "error", message, phase: "idle" });
          notify(message);
        });
      return item;
    },
    [clearReveal, currentAttempt, nextAttempt, notify, patch, refresh, saved.data?.limits, scheduleReveal],
  );

  const uploadAssets = useCallback(
    (files: File[]) => {
      if (files.length === 0) {
        return;
      }
      const additions = files.map((file) => startOne(file));
      setItems((current) => [...additions, ...current]);
    },
    [startOne],
  );

  const retryAsset = useCallback(
    (localId: string) => {
      const current = itemsRef.current.find((item) => item.localId === localId);
      if (!current || current.status === "preparing" || current.status === "uploading" || current.status === "success") {
        return;
      }
      current.task?.cancel();
      const next = startOne(current.file, localId);
      setItems((rows) => rows.map((row) => (row.localId === localId ? next : row)));
    },
    [startOne],
  );

  const removeLocal = useCallback(
    (localId: string) => {
      clearReveal(localId);
      setItems((current) => current.filter((row) => row.localId !== localId));
    },
    [clearReveal],
  );

  const cancelAsset = useCallback(
    (localId: string) => {
      itemsRef.current.find((row) => row.localId === localId)?.task?.cancel();
      removeLocal(localId);
    },
    [removeLocal],
  );

  const removeSaved = useCallback(
    async (id: string) => {
      try {
        await deleteUpload(id);
        setItems((current) => current.filter((row) => row.record?.id !== id));
        refresh();
        notify("文件已删除", "success");
      } catch (error) {
        notify(failureMessage(error));
      }
    },
    [notify, refresh],
  );

  return { cancelAsset, items, notice, refresh, removeLocal, removeSaved, retryAsset, saved, uploadAssets };
}

function failureMessage(error: unknown): string {
  if (error instanceof DirectUploadError && error.reason === "token") {
    return "上传凭证被拒绝，请重试";
  }
  if (error instanceof DirectUploadError && error.reason === "provider") {
    return "服务器暂时不可用";
  }
  if (error instanceof DirectUploadError && error.reason === "network") {
    return "网络连接失败";
  }
  if (isApiError(error) && error.details.reason === "file_size") {
    return "文件超过大小限制";
  }
  if (isApiError(error) && error.code === "validation_error") {
    return "文件格式不支持";
  }
  if (isApiError(error) && (error.code === "network_error" || error.code === "timeout")) {
    return "网络连接失败";
  }
  if (isApiError(error) && error.code === "storage_unavailable") {
    return "服务器暂时不可用";
  }
  if (!isApiError(error)) {
    return "网络连接失败";
  }
  return "服务器暂时不可用";
}
