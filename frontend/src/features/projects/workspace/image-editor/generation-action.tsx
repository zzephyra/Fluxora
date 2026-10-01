import { brand } from "../../../../brand";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../../../../components/ui/dialog";
import { Button } from "../../../../components/ui/button";
import { isApiError, apiRequest } from "../../../../lib/api";
import {
  assetContentPath,
  getImageGeneration,
  type GenerationTask,
} from "../../image-generation";
import { getEditorOptions, requestImageAction } from "../../image-edit";

export type ImageAction = {
  image: Blob;
  mask?: Blob;
  prompt: string;
  kind: "image" | "video";
};

export function GenerationAction({
  projectId,
  input,
  onClose,
  onResult,
}: {
  projectId: string;
  input: ImageAction;
  onClose: () => void;
  onResult: (task: GenerationTask) => void;
}) {
  const [preview, setPreview] = useState("");
  const [prompt, setPrompt] = useState(input.prompt);
  const [resolution, setResolution] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const attempt = useRef({
    inputId: crypto.randomUUID(),
    key: crypto.randomUUID(),
  });
  const submitted = useRef<{ prompt: string; resolution: string } | null>(null);
  const controller = useRef(new AbortController());
  useEffect(() => {
    const url = URL.createObjectURL(input.image);
    setPreview(url);
    const active = new AbortController();
    controller.current = active;
    return () => {
      URL.revokeObjectURL(url);
      active.abort();
    };
  }, [input.image]);
  const options = useQuery({
    queryKey: ["image-editor-options", projectId],
    queryFn: ({ signal }) => getEditorOptions(projectId, signal),
  });
  const capability =
    input.kind === "video" ? "image_to_video" : "image_inpaint";
  const option = options.data?.find((item) => item.capability === capability);
  const selectedResolution = resolution || option?.resolutions[0] || "";
  const create = useMutation({
    mutationFn: async () => {
      const values = submitted.current ?? {
        prompt: prompt.trim(),
        resolution: selectedResolution,
      };
      submitted.current = values;
      return requestImageAction(
        projectId,
        { ...input, ...values },
        attempt.current,
        controller.current.signal,
      );
    },
    onSuccess: (task) => {
      if (!controller.current.signal.aborted) setTaskId(task.id);
    },
  });
  const task = useQuery({
    queryKey: ["image-action-task", projectId, taskId],
    enabled: taskId !== null,
    queryFn: ({ signal }) => getImageGeneration(projectId, taskId!, signal),
    refetchInterval: (query) =>
      ["succeeded", "failed", "canceled"].includes(
        query.state.data?.status ?? "",
      )
        ? false
        : 2000,
    refetchIntervalInBackground: false,
  });
  const cancel = useMutation({
    mutationFn: () =>
      apiRequest({
        path: `/api/v1/projects/${projectId}/generation-tasks/${taskId}/cancel`,
        method: "POST",
        csrf: true,
      }),
    onSuccess: () => {
      void task.refetch();
    },
  });
  const validationError = input.image.size > 80 * 1024 * 1024
    ? "当前画布导出后超过 80 MB，请关闭弹窗，缩小图片尺寸后重新提交。"
    : input.mask && input.mask.size > 80 * 1024 * 1024
      ? "选区蒙版超过 80 MB，请缩小图片尺寸后重新提交。"
      : input.kind === "image" && !input.mask
        ? "缺少重绘选区，请关闭弹窗并重新涂抹需要修改的区域。"
        : null;
  const error = create.error ?? task.error ?? cancel.error;
  const result = task.data;
  const output = result?.output_asset_ids[0];
  function close() {
    const latest = result ?? create.data;
    if (latest) onResult(latest);
    else onClose();
  }
  const locked =
    create.isPending || submitted.current !== null || taskId !== null;
  const labels: Record<string, string> = {
    queued: "排队中",
    submitting: "正在提交",
    running: `${brand.name} 正在将灵感化为画面`,
    succeeded: "生成完成",
    failed: "生成失败",
    canceled: "已取消",
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !create.isPending) close();
      }}
    >
      <DialogContent className="image-action-dialog">
        <div className="mb-4 space-y-2">
          <DialogTitle>
            {input.kind === "video" ? "让这张图片动起来" : "局部重绘"}
          </DialogTitle>
          <DialogDescription>
            {input.kind === "video"
              ? "以当前画布作为首帧，描述主体动作与镜头运动。"
              : "仅修改涂抹区域，原图会保留，新图片保存到当前项目。"}
          </DialogDescription>
        </div>
        {output ? (
          input.kind === "video" ? (
            <video
              controls
              playsInline
              src={assetContentPath(projectId, output)}
            />
          ) : (
            <img alt="重绘结果" src={assetContentPath(projectId, output)} />
          )
        ) : preview ? (
          <img alt="本次生成的参考图片" src={preview} />
        ) : null}
        <label>
          创作描述
          <textarea
            aria-label="创作描述"
            disabled={locked}
            value={prompt}
            maxLength={input.kind === "video" ? 800 : 10000}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={
              input.kind === "video"
                ? "例如：镜头缓缓推进，风吹动人物的头发，自然光影流动"
                : "描述希望在选中区域出现的内容"
            }
          />
        </label>
        {options.isPending ? (
          <p role="status">正在读取模型配置…</p>
        ) : options.isError ? (
          <Button onClick={() => void options.refetch()}>重试加载模型</Button>
        ) : (
          <p className="image-action-model">
            {option?.available
              ? `统一${input.kind === "image" ? "图片" : "视频"}模型 · ${option.model_name}`
              : (option?.reason ?? "此能力暂不可用")}
          </p>
        )}
        {input.kind === "video" && option?.available && (
          <div className="image-action-settings">
            <label>
              清晰度
              <select
                aria-label="视频清晰度"
                disabled={locked}
                value={selectedResolution}
                onChange={(event) => setResolution(event.target.value)}
              >
                {option.resolutions.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <span>{option.duration} 秒 · 比例跟随首帧</span>
          </div>
        )}
        {result && (
          <p role="status">
            {labels[result.status] ?? result.status}
            {result.error ? `：${result.error.message}` : ""}
          </p>
        )}
        {(validationError || error) && (
          <p role="alert">
            {validationError ?? (isApiError(error) || error instanceof Error ? error.message : "操作未完成，请重试")}
          </p>
        )}
        <div className="image-action-buttons">
          {!taskId && (
            <Button
              disabled={
                !!validationError || !option?.available || !prompt.trim() || create.isPending
              }
              onClick={() => create.mutate()}
            >
              {create.isPending
                ? "正在提交…"
                : create.isError
                  ? "重试本次提交"
                  : "确认生成"}
            </Button>
          )}
          {result?.allowed_actions.includes("cancel") && (
            <Button disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              取消排队
            </Button>
          )}
          {result?.status === "succeeded" && output && (
            <Button onClick={() => onResult(result)}>
              {input.kind === "video" ? "查看视频作品" : "使用重绘结果"}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={create.isPending}
            onClick={close}
          >
            {taskId && !output ? "关闭，稍后在生成记录查看" : "关闭"}
          </Button>
        </div>
        {create.isError && !taskId && (
          <p>
            重试将使用相同内容与请求标识，避免重复生成。需要修改内容时关闭后重新打开。
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
