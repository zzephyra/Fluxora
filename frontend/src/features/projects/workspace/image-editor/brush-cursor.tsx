import type Konva from "konva";
import { forwardRef } from "react";
import { Circle } from "react-konva";

export const BrushCursor = forwardRef<Konva.Circle, { radius: number }>(function BrushCursor({ radius }, ref) {
  return (
    <Circle
      listening={false}
      radius={Math.max(radius, 1)}
      ref={ref}
      stroke="rgba(211, 249, 107, 0.9)"
      strokeWidth={1}
      visible={false}
    />
  );
});
