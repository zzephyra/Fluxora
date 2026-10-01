import { useCallback, useEffect, useState } from "react";
import useImage from "use-image";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../../components/ui/dropdown-menu";
import { isApiError } from "../../../../lib/api";
import { requestErase, requestOutpaint } from "../../image-edit";
import { BrushSettings } from "./brush-settings";
import { EditorCanvas } from "./editor-canvas";
import { useCrop } from "./hooks/use-crop";
import { useEditorHistory } from "./hooks/use-editor-history";
import { useEditorTransform } from "./hooks/use-editor-transform";
import { PromptBar } from "./prompt-bar";
import { ASPECT_PRESETS, type EditorTool, type MaskMode, type OutpaintFrame, type Stroke } from "./types";
import { applyAction } from "./utils/document";
import { fixedCropFrame, imageCropFromFrame } from "./utils/coordinates";
import { downloadBlob, exportImage, type ImageMime } from "./utils/export-image";
import { exportMask } from "./utils/export-mask";
import { frameForRatio } from "./utils/strokes";

import { GenerationAction, type ImageAction } from "./generation-action";
import type { GenerationTask } from "../../image-generation";

export function ImageEditor({ src, projectId, onResult }: { src: string; projectId: string; onResult: (task: GenerationTask) => void }) {
  const [action, setAction] = useState<ImageAction | null>(null);
  const [objectUrl, setObjectUrl] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [image] = useImage(objectUrl);
  const [stage, setStage] = useState({ width: 1, height: 1 });
  const [tool, setTool] = useState<EditorTool>("view");
  const [maskMode, setMaskMode] = useState<MaskMode>("brush");
  const [brushSize, setBrushSize] = useState(40);
  const [prompt, setPrompt] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [frame, setFrame] = useState<OutpaintFrame | null>(null);
  const history = useEditorHistory(image ?? null, image?.naturalWidth ?? 0, image?.naturalHeight ?? 0);
  const transform = useEditorTransform();
  const documentState = history.documentState;
  const crop = useCrop();

  useEffect(() => {
    const controller = new AbortController();
    let url = "";
    setLoadFailed(false);
    setObjectUrl("");
    fetch(src, { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("load");
        }
        url = URL.createObjectURL(await response.blob());
        if (!controller.signal.aborted) {
          setObjectUrl(url);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoadFailed(true);
        }
      });
    return () => {
      controller.abort();
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [src]);

  const view = transform.viewFor(
    stage.width,
    stage.height,
    documentState?.width ?? 1,
    documentState?.height ?? 1,
  );
  const onStageSize = useCallback((width: number, height: number) => {
    setStage({ width, height });
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          history.redo();
        } else {
          history.undo();
        }
      }
      if (tool === "erase" || tool === "inpaint") {
        if (event.key.toLowerCase() === "b") {
          setMaskMode("brush");
        }
        if (event.key.toLowerCase() === "e") {
          setMaskMode("eraser");
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history, tool]);

  function selectTool(next: EditorTool) {
    setNotice(null);
    if (tool === next) {
      setTool("view");
      return;
    }
    setTool(next);
    if (next === "crop") {
      crop.chooseRatio(null);
      transform.resetView();
    }
    if (next === "outpaint" && documentState) {
      setFrame({ width: documentState.width, height: documentState.height, imageX: 0, imageY: 0 });
    }
  }

  function commitStroke(stroke: Stroke) {
    history.commit(stroke.mode === "remove" ? { type: "mask-remove", payload: stroke } : { type: "mask-add", payload: stroke });
  }

  async function saveImage(mime: ImageMime) {
    if (!documentState) {
      return;
    }
    const blob = await exportImage(documentState.source, documentState.width, documentState.height, mime);
    const extension = mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "webp";
    downloadBlob(blob, `lumi.${extension}`);
  }

  async function saveMask() {
    if (!documentState) {
      return;
    }
    downloadBlob(await exportMask(documentState.width, documentState.height, documentState.strokes), "lumi-mask.png");
  }

  async function submitErase() {
    if (!documentState) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await requestErase({
        image: await exportImage(documentState.source, documentState.width, documentState.height, "image/png"),
        mask: await exportMask(documentState.width, documentState.height, documentState.strokes),
      });
    } catch (error) {
      setNotice(isApiError(error) ? error.message : "消除没有完成");
    } finally {
      setBusy(false);
    }
  }

  async function submitInpaint() {
    if (busy || !documentState || !documentState.strokes.some(stroke => stroke.mode === "add") || prompt.trim().length === 0) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      setAction({
        kind: "image",
        image: await exportImage(documentState.source, documentState.width, documentState.height, "image/png"),
        mask: await exportMask(documentState.width, documentState.height, documentState.strokes),
        prompt: prompt.trim(),
      });
    } catch (error) {
      setNotice(isApiError(error) ? error.message : "局部重绘没有完成");
    } finally {
      setBusy(false);
    }
  }

  async function confirmOutpaint() {
    if (!documentState || !frame) {
      return;
    }
    const action = { type: "outpaint" as const, payload: frame };
    const next = applyAction(documentState, action);
    history.commit(action);
    setTool("view");
    setBusy(true);
    try {
      await requestOutpaint({
        image: await exportImage(next.source, next.width, next.height, "image/png"),
        width: Math.round(frame.width),
        height: Math.round(frame.height),
        imageX: Math.round(frame.imageX),
        imageY: Math.round(frame.imageY),
      });
    } catch (error) {
      setNotice(isApiError(error) ? `${error.message}。画布已按原图坐标扩大，空白区域不会被自动填充。` : "扩图没有完成");
    } finally {
      setBusy(false);
    }
  }

  if (loadFailed) {
    return <p className="image-editor-note">图片没有载入</p>;
  }
  if (!image || !documentState) {
    return null;
  }

  return (
    <div className="image-editor">
      {action && <GenerationAction projectId={projectId} input={action} onClose={() => setAction(null)} onResult={task => { setAction(null); onResult(task); }} />}
      <EditorCanvas
        brushSize={brushSize}
        cropRatio={crop.ratio}
        documentState={documentState}
        maskMode={maskMode}
        onOutpaint={setFrame}
        onPan={(dx, dy) => transform.panBy(view, dx, dy)}
        onResetView={transform.resetView}
        onStageSize={onStageSize}
        onStroke={commitStroke}
        onZoom={(factor, x, y) => transform.zoomBy(view, factor, x, y)}
        outpaint={tool === "outpaint" ? frame : null}
        tool={tool}
        view={view}
      />
      <div className="image-editor-top">
        <button onClick={() => history.commit({ type: "rotate", payload: { degrees: -90 } })} type="button">
          向左旋转
        </button>
        <button onClick={() => history.commit({ type: "rotate", payload: { degrees: 90 } })} type="button">
          向右旋转
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger className="image-editor-menu">导出</DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void saveImage("image/png")}>PNG</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void saveImage("image/jpeg")}>JPEG</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void saveImage("image/webp")}>WebP</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void saveMask()}>导出 Mask</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {notice ? <p className="image-editor-note" role="status">{notice}</p> : null}
      <div className="image-editor-dock">
      {tool === "inpaint" ? (
        <PromptBar busy={busy} hasSelection={documentState.strokes.some(stroke => stroke.mode === "add")} onChange={setPrompt} onSubmit={() => void submitInpaint()} value={prompt} />
      ) : null}
      {tool === "erase" || tool === "inpaint" ? (
        <BrushSettings brushSize={brushSize} mode={maskMode} onBrushSize={setBrushSize} onMode={setMaskMode} />
      ) : null}
      {tool === "crop" || tool === "outpaint" ? (
        <div className="image-editor-ratios">
          {ASPECT_PRESETS.filter((preset) => tool === "crop" || preset.ratio !== null).map((preset) => (
            <button
              key={preset.id}
              onClick={() => {
                if (tool === "crop") {
                  crop.chooseRatio(preset.ratio);
                  return;
                }
                if (documentState && preset.ratio !== null) {
                  setFrame(frameForRatio(documentState.width, documentState.height, preset.ratio));
                }
              }}
              type="button"
            >
              {preset.label}
            </button>
          ))}
          {tool === "crop" ? (
            <>
              <button onClick={() => setTool("view")} type="button">取消</button>
              <button
                className="image-editor-confirm"
                onClick={() => {
                  const rect = imageCropFromFrame(view, fixedCropFrame(view, crop.ratio));
                  history.commit({ type: "crop", payload: rect });
                  transform.resetView();
                  setTool("view");
                }}
                type="button"
              >
                确认裁剪
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setTool("view")} type="button">取消</button>
              <button disabled={busy} onClick={() => void confirmOutpaint()} type="button">确认扩图</button>
            </>
          )}
        </div>
      ) : null}
      <div className="image-editor-toolbar" role="toolbar" aria-label="图片编辑">
        <button disabled={busy} onClick={() => {
          setBusy(true);
          void exportImage(documentState.source, documentState.width, documentState.height, "image/png")
            .then(image => setAction({ image, prompt: "", kind: "video" }))
            .catch(() => setNotice("图片导出失败，请重试"))
            .finally(() => setBusy(false));
        }} type="button">生成视频</button>
        <button aria-pressed={tool === "inpaint"} onClick={() => selectTool("inpaint")} type="button">局部重绘</button>
        <button aria-pressed={tool === "outpaint"} onClick={() => selectTool("outpaint")} type="button">扩图</button>
        <button aria-pressed={tool === "erase"} onClick={() => selectTool("erase")} type="button">消除笔</button>
        <button disabled title="画质增强尚未开放" type="button">画质增强</button>
        <button aria-pressed={tool === "crop"} onClick={() => selectTool("crop")} type="button">裁剪</button>
        <button disabled={!history.canUndo} onClick={history.undo} type="button">撤销</button>
        <button disabled={!history.canRedo} onClick={history.redo} type="button">重做</button>
        <button onClick={transform.resetView} type="button">恢复居中</button>
        <button
          onClick={() => {
            history.reset();
            transform.resetView();
            setTool("view");
            setNotice(null);
          }}
          type="button"
        >
          重置
        </button>
        {tool === "erase" ? (
          <button disabled={busy || documentState.strokes.length === 0} onClick={() => void submitErase()} type="button">
            消除
          </button>
        ) : null}
        {tool === "erase" || tool === "inpaint" ? (
          <button
            disabled={documentState.strokes.length === 0}
            onClick={() => history.commit({ type: "mask-clear", payload: null })}
            type="button"
          >
            清空蒙版
          </button>
        ) : null}
      </div>
      </div>
    </div>
  );
}
