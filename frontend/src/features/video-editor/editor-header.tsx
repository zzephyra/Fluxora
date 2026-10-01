import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Download, Redo2, Save, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { LumiMark } from "../../components/brand/LumiLogo";
import { editorError } from "./api";
import {
  createRender,
  getLatestRender,
  getRender,
  mediaUrl,
  saveDocument,
} from "./api";
import { useEditor, useEditorStore } from "./store";
export function EditorHeader({
  projectId,
  documentId,
}: {
  projectId: string;
  documentId: string;
}) {
  const draft = useEditor((s) => s.draft);
  const dirty = useEditor((s) => s.draft !== s.saved);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const store = useEditorStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const renderKey = useRef<{ version: number; key: string } | null>(null);
  const latest = useQuery({
    queryKey: ["projects", projectId, "editor-latest-render", documentId],
    queryFn: ({ signal }) => getLatestRender(projectId, documentId, signal),
  });
  const effectiveTaskId = taskId ?? latest.data?.id ?? null;
  const task = useQuery({
    queryKey: ["projects", projectId, "editor-render", effectiveTaskId],
    queryFn: ({ signal }) => getRender(projectId, effectiveTaskId!, signal),
    enabled: Boolean(effectiveTaskId),
    refetchInterval: (query) =>
      !query.state.error &&
      ["queued", "running"].includes(query.state.data?.status ?? "queued")
        ? 2000
        : false,
  });
  const active =
    effectiveTaskId !== null &&
    (!task.data || ["queued", "running"].includes(task.data.status));
  const save = useMutation({
    mutationFn: async () => {
      const s = store.getState();
      const captured = s.draft;
      if (captured === s.saved) return { version: s.version };
      const result = await saveDocument(projectId, documentId, {
        ...captured,
        expected_version: s.version,
      });
      store.getState().markSaved(captured, result.version);
      queryClient.setQueryData(
        ["projects", projectId, "editor-document", documentId],
        result,
      );
      return result;
    },
    onError: (e) => setError(editorError(e)),
  });
  const exportVideo = useMutation({
    mutationFn: async () => {
      setError(null);
      const result = await save.mutateAsync();
      if (renderKey.current?.version !== result.version)
        renderKey.current = {
          version: result.version,
          key: crypto.randomUUID(),
        };
      const queued = await createRender(
        projectId,
        documentId,
        result.version,
        renderKey.current.key,
      );
      setTaskId(queued.id);
      queryClient.setQueryData(
        ["projects", projectId, "editor-render", queued.id],
        queued,
      );
    },
    onError: (e) => setError(editorError(e)),
  });
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (store.getState().draft !== store.getState().saved) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [store]);
  function downloadJson() {
    const blob = new Blob(
      [
        JSON.stringify(
          { project_id: projectId, ...store.getState().draft },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${draft.title}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <header className="ve-header">
        <div className="ve-header-title">
          <Button
            variant="ghost"
            aria-label="返回生成页"
            onClick={() => {
              if (!dirty || window.confirm("有未保存的修改，确定离开吗？"))
                navigate(`/projects/${projectId}/generation`);
            }}
          >
            <ArrowLeft size={18} />
          </Button>
          <LumiMark width={28} height={28} />
          <input
            aria-label="工程名称"
            value={draft.title}
            maxLength={120}
            onChange={(e) =>
              store
                .getState()
                .edit({ ...store.getState().draft, title: e.target.value })
            }
          />
          <span className="ve-save-state">
            {dirty ? (
              "未保存"
            ) : (
              <>
                <Check size={12} /> 已保存
              </>
            )}
          </span>
        </div>
        <div className="ve-header-actions">
          <Button
            aria-label="撤销"
            variant="ghost"
            disabled={!canUndo}
            onClick={() => store.getState().undo()}
          >
            <Undo2 size={16} />
          </Button>
          <Button
            aria-label="重做"
            variant="ghost"
            disabled={!canRedo}
            onClick={() => store.getState().redo()}
          >
            <Redo2 size={16} />
          </Button>
          <Button
            variant="outline"
            disabled={
              save.isPending || exportVideo.isPending || !draft.title.trim()
            }
            onClick={() => {
              setError(null);
              save.mutate();
            }}
          >
            <Save size={14} /> {save.isPending ? "保存中" : "保存"}
          </Button>
          <Button variant="ghost" onClick={downloadJson}>
            工程 JSON
          </Button>
          <Button
            disabled={
              active ||
              save.isPending ||
              latest.isPending ||
              latest.isError ||
              exportVideo.isPending ||
              !draft.title.trim() ||
              draft.composition.tracks[0].clips.length === 0
            }
            onClick={() => {
              if (task.data?.status === "failed") renderKey.current = null;
              exportVideo.mutate();
            }}
          >
            <Download size={14} />{" "}
            {active
              ? task.data?.status === "running"
                ? "正在导出"
                : "等待导出"
              : exportVideo.isPending
                ? "提交中"
                : "导出视频"}
          </Button>
        </div>
      </header>
      {(error || latest.error || task.error || task.data?.error) && (
        <div className="ve-banner" role="alert">
          {error ??
            (latest.error
              ? editorError(latest.error)
              : task.error
                ? editorError(task.error)
                : task.data?.error)}
          {latest.isError && (
            <Button variant="ghost" onClick={() => void latest.refetch()}>
              重新查询导出
            </Button>
          )}
          {task.isError && (
            <Button variant="ghost" onClick={() => void task.refetch()}>
              重新查询
            </Button>
          )}
        </div>
      )}
      {task.data?.status === "succeeded" && task.data.output_asset_id && (
        <div className="ve-banner success" role="status">
          视频导出完成{" "}
          <a
            href={mediaUrl(projectId, task.data.output_asset_id)}
            download={`${draft.title}.mp4`}
          >
            下载 MP4
          </a>
        </div>
      )}
    </>
  );
}
