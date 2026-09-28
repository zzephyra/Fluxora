import { Line, Rect } from "react-konva";

import type { CropRect } from "./types";

export function CropTool({ rect }: { rect: CropRect }) {
  return (
    <>
      <Rect fill="rgba(8, 10, 8, 0.55)" height={rect.y} listening={false} width={100000} x={-50000} y={-50000} />
      <Rect
        fill="rgba(8, 10, 8, 0.55)"
        height={100000}
        listening={false}
        width={100000}
        x={-50000}
        y={rect.y + rect.height}
      />
      <Rect
        fill="rgba(8, 10, 8, 0.55)"
        height={rect.height}
        listening={false}
        width={rect.x + 50000}
        x={-50000}
        y={rect.y}
      />
      <Rect
        fill="rgba(8, 10, 8, 0.55)"
        height={rect.height}
        listening={false}
        width={100000}
        x={rect.x + rect.width}
        y={rect.y}
      />
      <Rect
        height={rect.height}
        listening={false}
        stroke="rgba(211, 249, 107, 0.95)"
        strokeWidth={1}
        x={rect.x}
        y={rect.y}
      />
      {[1 / 3, 2 / 3].map((part) => (
        <Line
          key={`v-${part}`}
          listening={false}
          points={[rect.x + rect.width * part, rect.y, rect.x + rect.width * part, rect.y + rect.height]}
          stroke="rgba(242, 240, 233, 0.35)"
          strokeWidth={1}
        />
      ))}
      {[1 / 3, 2 / 3].map((part) => (
        <Line
          key={`h-${part}`}
          listening={false}
          points={[rect.x, rect.y + rect.height * part, rect.x + rect.width, rect.y + rect.height * part]}
          stroke="rgba(242, 240, 233, 0.35)"
          strokeWidth={1}
        />
      ))}
    </>
  );
}
