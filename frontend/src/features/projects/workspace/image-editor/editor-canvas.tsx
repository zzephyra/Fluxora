import type Konva from "konva";
import { useEffect, useRef, useState } from "react";
import { Group, Image as KonvaImage, Layer, Stage } from "react-konva";

import { BrushCursor } from "./brush-cursor";
import { CropTool } from "./crop-tool";
import { useMask } from "./hooks/use-mask";
import { MaskLayer } from "./mask-layer";
import { OutpaintBackdrop, OutpaintHandles } from "./outpaint-tool";
import type { EditorDocument, EditorTool, MaskMode, OutpaintFrame, Stroke, ViewTransform } from "./types";
import { displayScale, fixedCropFrame, imageToScreen, screenToImage } from "./utils/coordinates";
import { outpaintGesture } from "./utils/hits";

type Drag =
  | { kind: "pan"; x: number; y: number }
  | { kind: "paint" }
  | { kind: "outpaint-image"; x: number; y: number; frame: OutpaintFrame }
  | { kind: "outpaint-edge"; edge: "n" | "s" | "e" | "w"; x: number; y: number; frame: OutpaintFrame };

export function EditorCanvas({
  documentState,
  view,
  tool,
  maskMode,
  brushSize,
  cropRatio,
  outpaint,
  onStroke,
  onPan,
  onZoom,
  onOutpaint,
  onStageSize,
  onResetView,
}: {
  documentState: EditorDocument;
  view: ViewTransform;
  tool: EditorTool;
  maskMode: MaskMode;
  brushSize: number;
  cropRatio: number | null;
  outpaint: OutpaintFrame | null;
  onStroke: (stroke: Stroke) => void;
  onPan: (dx: number, dy: number) => void;
  onZoom: (factor: number, x: number, y: number) => void;
  onOutpaint: (frame: OutpaintFrame) => void;
  onStageSize: (width: number, height: number) => void;
  onResetView: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const cursorShape = useRef<Konva.Circle>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const painting = tool === "erase" || tool === "inpaint";
  const liveView = { ...view, stageWidth: size.width, stageHeight: size.height };
  const mask = useMask(liveView, maskMode, brushSize, onStroke, painting);
  const space = useRef(false);
  const api = useRef({
    tool,
    liveView,
    outpaint,
    painting,
    documentState,
    brushSize,
    mask,
    onPan,
    onZoom,
    onOutpaint,
    onResetView,
  });
  api.current = {
    tool,
    liveView,
    outpaint,
    painting,
    documentState,
    brushSize,
    mask,
    onPan,
    onZoom,
    onOutpaint,
    onResetView,
  };

  useEffect(() => {
    const node = host.current;
    if (!node) {
      return;
    }
    const observer = new ResizeObserver(() => {
      const bounds = node.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      setSize({ width, height });
      onStageSize(width, height);
    });
    observer.observe(node);
    const bounds = node.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    setSize({ width, height });
    onStageSize(width, height);
    return () => observer.disconnect();
  }, [onStageSize]);

  useEffect(() => {
    const node = host.current;
    if (!node) {
      return;
    }
    let drag: Drag | null = null;

    const pointOf = (event: PointerEvent) => {
      const bounds = node.getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    };
    const placeCursor = (x: number, y: number) => {
      const circle = cursorShape.current;
      const current = api.current;
      if (!circle) {
        return;
      }
      circle.radius(Math.max((current.brushSize * displayScale(current.liveView)) / 2, 1));
      circle.position({ x, y });
      circle.visible(current.painting);
      circle.getLayer()?.batchDraw();
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }
      const point = pointOf(event);
      const current = api.current;
      node.setPointerCapture(event.pointerId);
      if (space.current || current.tool === "view" || current.tool === "pan" || current.tool === "crop") {
        drag = { kind: "pan", ...point };
        node.classList.add("is-dragging");
        return;
      }
      if (current.painting) {
        drag = { kind: "paint" };
        current.mask.start(point.x, point.y);
        placeCursor(point.x, point.y);
        return;
      }
      if (current.tool === "outpaint" && current.outpaint) {
        const hit = outpaintGesture(
          point.x,
          point.y,
          current.outpaint,
          current.documentState.width,
          current.documentState.height,
          current.liveView,
        );
        if (hit === "image") {
          drag = { kind: "outpaint-image", ...point, frame: current.outpaint };
        } else if (hit) {
          drag = { kind: "outpaint-edge", edge: hit, ...point, frame: current.outpaint };
        } else {
          drag = { kind: "pan", ...point };
          node.classList.add("is-dragging");
        }
      }
    };
    const onMove = (event: PointerEvent) => {
      const point = pointOf(event);
      const current = api.current;
      if (current.painting) {
        placeCursor(point.x, point.y);
      }
      if (!drag) {
        return;
      }
      if (drag.kind === "pan") {
        current.onPan(point.x - drag.x, point.y - drag.y);
        drag = { kind: "pan", ...point };
        return;
      }
      if (drag.kind === "paint") {
        current.mask.move(point.x, point.y);
        return;
      }
      const before = screenToImage(drag.x, drag.y, current.liveView);
      const after = screenToImage(point.x, point.y, current.liveView);
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      if (drag.kind === "outpaint-image") {
        const frame = moveImage(drag.frame, dx, dy, current.documentState.width, current.documentState.height);
        current.onOutpaint(frame);
        drag = { kind: "outpaint-image", ...point, frame };
        return;
      }
      const frame = resizeFrame(drag.frame, drag.edge, dx, dy, current.documentState.width, current.documentState.height);
      current.onOutpaint(frame);
      drag = { kind: "outpaint-edge", edge: drag.edge, ...point, frame };
    };
    const finish = () => {
      api.current.mask.end();
      drag = null;
      node.classList.remove("is-dragging");
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = node.getBoundingClientRect();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const limited = Math.max(-48, Math.min(48, delta));
      const factor = Math.min(1.04, Math.max(0.96, Math.exp(-limited * 0.001)));
      api.current.onZoom(factor, event.clientX - bounds.left, event.clientY - bounds.top);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) {
        return;
      }
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      event.preventDefault();
      space.current = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        space.current = false;
      }
    };
    const reset = () => api.current.onResetView();
    node.addEventListener("pointerdown", onDown, true);
    node.addEventListener("pointermove", onMove, true);
    node.addEventListener("pointerup", finish, true);
    node.addEventListener("pointercancel", finish, true);
    node.addEventListener("dblclick", reset);
    node.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      node.removeEventListener("pointerdown", onDown, true);
      node.removeEventListener("pointermove", onMove, true);
      node.removeEventListener("pointerup", finish, true);
      node.removeEventListener("pointercancel", finish, true);
      node.removeEventListener("dblclick", reset);
      node.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const scale = displayScale(liveView);
  const placed = imageToScreen(liveView.imageWidth / 2, liveView.imageHeight / 2, liveView);

  return (
    <div className={`image-editor-stage tool-${tool}`} ref={host}>
      <Stage height={size.height} width={size.width}>
        <Layer>
          <Group
            offsetX={documentState.width / 2}
            offsetY={documentState.height / 2}
            rotation={view.rotation}
            scaleX={scale}
            scaleY={scale}
            x={placed.x}
            y={placed.y}
          >
            {tool === "outpaint" && outpaint ? <OutpaintBackdrop frame={outpaint} /> : null}
            <KonvaImage
              height={documentState.height}
              image={documentState.source}
              listening={false}
              width={documentState.width}
            />
            <MaskLayer draftRef={mask.draft} strokes={documentState.strokes} />
            {tool === "outpaint" && outpaint ? <OutpaintHandles frame={outpaint} scale={scale || 1} /> : null}
          </Group>
          {tool === "crop" ? <CropTool rect={fixedCropFrame(liveView, cropRatio)} /> : null}
          {painting ? <BrushCursor radius={(brushSize * scale) / 2} ref={cursorShape} /> : null}
        </Layer>
      </Stage>
    </div>
  );
}

function moveImage(frame: OutpaintFrame, dx: number, dy: number, imageWidth: number, imageHeight: number): OutpaintFrame {
  return {
    ...frame,
    imageX: Math.min(Math.max(0, frame.imageX + dx), Math.max(0, frame.width - imageWidth)),
    imageY: Math.min(Math.max(0, frame.imageY + dy), Math.max(0, frame.height - imageHeight)),
  };
}

function resizeFrame(
  frame: OutpaintFrame,
  edge: "n" | "s" | "e" | "w",
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number,
): OutpaintFrame {
  let { width, height, imageX, imageY } = frame;
  if (edge === "e") {
    width += dx;
  }
  if (edge === "s") {
    height += dy;
  }
  if (edge === "w") {
    imageX -= dx;
    width -= dx;
  }
  if (edge === "n") {
    imageY -= dy;
    height -= dy;
  }
  imageX = Math.max(0, imageX);
  imageY = Math.max(0, imageY);
  return {
    imageX,
    imageY,
    width: Math.max(imageWidth + imageX, width),
    height: Math.max(imageHeight + imageY, height),
  };
}
