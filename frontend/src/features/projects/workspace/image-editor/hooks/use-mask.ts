import type Konva from "konva";
import { useEffect, useRef } from "react";

import type { MaskMode, Stroke, ViewTransform } from "../types";
import { screenToImage } from "../utils/coordinates";

type Commit = (stroke: Stroke) => void;

export function useMask(view: ViewTransform, mode: MaskMode, brushSize: number, commit: Commit, enabled: boolean) {
  const draft = useRef<Konva.Line | null>(null);
  const points = useRef<number[]>([]);
  const frame = useRef<number | null>(null);
  const pending = useRef<{ x: number; y: number } | null>(null);
  const drawing = useRef(false);
  const viewRef = useRef(view);
  const modeRef = useRef(mode);
  const brushRef = useRef(brushSize);
  const commitRef = useRef(commit);
  viewRef.current = view;
  modeRef.current = mode;
  brushRef.current = brushSize;
  commitRef.current = commit;

  useEffect(() => {
    return () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
      }
    };
  }, []);

  function paint() {
    frame.current = null;
    const point = pending.current;
    const line = draft.current;
    if (!point || !line) {
      return;
    }
    const imagePoint = screenToImage(point.x, point.y, viewRef.current);
    const lastX = points.current[points.current.length - 2];
    const lastY = points.current[points.current.length - 1];
    if (lastX !== undefined && lastY !== undefined && Math.hypot(imagePoint.x - lastX, imagePoint.y - lastY) < 0.5) {
      return;
    }
    points.current = [...points.current, imagePoint.x, imagePoint.y];
    line.visible(true);
    line.strokeWidth(brushRef.current);
    line.points(points.current);
    line.getLayer()?.batchDraw();
  }

  function schedule(x: number, y: number) {
    pending.current = { x, y };
    if (frame.current !== null) {
      return;
    }
    frame.current = requestAnimationFrame(paint);
  }

  return {
    draft,
    start(x: number, y: number) {
      if (!enabled) {
        return;
      }
      const activeMode = modeRef.current;
      drawing.current = true;
      points.current = [];
      const line = draft.current;
      if (line) {
        line.stroke(activeMode === "eraser" ? "#fff" : "rgba(80, 255, 150, 0.35)");
        line.globalCompositeOperation(activeMode === "eraser" ? "destination-out" : "source-over");
        line.lineCap("round");
        line.lineJoin("round");
      }
      schedule(x, y);
    },
    move(x: number, y: number) {
      if (!drawing.current) {
        return;
      }
      schedule(x, y);
    },
    end() {
      if (!drawing.current) {
        return;
      }
      drawing.current = false;
      if (points.current.length >= 2) {
        commitRef.current({
          id: crypto.randomUUID(),
          mode: modeRef.current === "eraser" ? "remove" : "add",
          width: brushRef.current,
          points: points.current,
        });
      }
      points.current = [];
      draft.current?.visible(false);
      draft.current?.points([]);
    },
  };
}
