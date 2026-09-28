import { useMemo } from "react";
import { Rect } from "react-konva";

import type { OutpaintFrame } from "./types";

export function OutpaintBackdrop({ frame }: { frame: OutpaintFrame }) {
  const pattern = useMemo(() => checkerboard(), []);
  return (
    <Rect
      fillPatternImage={pattern as unknown as HTMLImageElement}
      height={frame.height}
      listening={false}
      width={frame.width}
      x={-frame.imageX}
      y={-frame.imageY}
    />
  );
}

export function OutpaintHandles({
  frame,
  scale,
}: {
  frame: OutpaintFrame;
  scale: number;
}) {
  const thickness = Math.max(10 / scale, 4);
  const left = -frame.imageX;
  const top = -frame.imageY;

  return (
    <>
      <Rect
        height={frame.height}
        listening={false}
        stroke="rgba(211, 249, 107, 0.45)"
        strokeWidth={1 / scale}
        width={frame.width}
        x={left}
        y={top}
      />
      <Rect
        fill="rgba(211, 249, 107, 0.22)"
        height={frame.height}
        listening={false}
        width={thickness}
        x={left - thickness / 2}
        y={top}
      />
      <Rect
        fill="rgba(211, 249, 107, 0.22)"
        height={frame.height}
        listening={false}
        width={thickness}
        x={left + frame.width - thickness / 2}
        y={top}
      />
      <Rect
        fill="rgba(211, 249, 107, 0.22)"
        height={thickness}
        listening={false}
        width={frame.width}
        x={left}
        y={top - thickness / 2}
      />
      <Rect
        fill="rgba(211, 249, 107, 0.22)"
        height={thickness}
        listening={false}
        width={frame.width}
        x={left}
        y={top + frame.height - thickness / 2}
      />
    </>
  );
}

function checkerboard() {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }
  context.fillStyle = "#121410";
  context.fillRect(0, 0, 16, 16);
  context.fillStyle = "#1d2118";
  context.fillRect(0, 0, 8, 8);
  context.fillRect(8, 8, 8, 8);
  return canvas;
}
