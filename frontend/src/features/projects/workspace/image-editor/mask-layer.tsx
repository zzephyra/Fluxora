import type Konva from "konva";
import { Line } from "react-konva";
import type { RefObject } from "react";

import type { Stroke } from "./types";

export function MaskLayer({
  strokes,
  draftRef,
}: {
  strokes: Stroke[];
  draftRef: RefObject<Konva.Line | null>;
}) {
  return (
    <>
      {strokes.map((stroke) => (
        <Line
          globalCompositeOperation={stroke.mode === "remove" ? "destination-out" : "source-over"}
          key={stroke.id}
          lineCap="round"
          lineJoin="round"
          listening={false}
          points={stroke.points}
          stroke={stroke.mode === "remove" ? "#fff" : "rgba(80, 255, 150, 0.35)"}
          strokeWidth={stroke.width}
        />
      ))}
      <Line
        lineCap="round"
        lineJoin="round"
        listening={false}
        ref={draftRef}
      />
    </>
  );
}
