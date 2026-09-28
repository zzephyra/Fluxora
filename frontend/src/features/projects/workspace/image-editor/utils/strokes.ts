import type { CropRect, OutpaintFrame, Stroke } from "../types";

export function translateStroke(stroke: Stroke, dx: number, dy: number): Stroke {
  const points = stroke.points.map((value, index) => value + (index % 2 === 0 ? dx : dy));
  return { ...stroke, points };
}

export function rotateStroke(stroke: Stroke, width: number, height: number, degrees: 90 | -90): Stroke {
  const points: number[] = [];
  for (let index = 0; index < stroke.points.length; index += 2) {
    const x = stroke.points[index] ?? 0;
    const y = stroke.points[index + 1] ?? 0;
    if (degrees === 90) {
      points.push(height - y, x);
    } else {
      points.push(y, width - x);
    }
  }
  return { ...stroke, points };
}

export function cropStrokes(strokes: Stroke[], rect: CropRect): Stroke[] {
  return strokes.map((stroke) => translateStroke(stroke, -rect.x, -rect.y));
}

export function outpaintStrokes(strokes: Stroke[], frame: OutpaintFrame): Stroke[] {
  return strokes.map((stroke) => translateStroke(stroke, frame.imageX, frame.imageY));
}

export function frameForRatio(width: number, height: number, ratio: number): OutpaintFrame {
  const current = width / height;
  if (current > ratio) {
    const nextHeight = width / ratio;
    return { width, height: nextHeight, imageX: 0, imageY: (nextHeight - height) / 2 };
  }
  const nextWidth = height * ratio;
  return { width: nextWidth, height, imageX: (nextWidth - width) / 2, imageY: 0 };
}

export function fittedCrop(width: number, height: number, ratio: number | null): CropRect {
  if (ratio === null) {
    const marginX = width * 0.1;
    const marginY = height * 0.1;
    return { x: marginX, y: marginY, width: width - marginX * 2, height: height - marginY * 2 };
  }
  const current = width / height;
  if (current > ratio) {
    const cropWidth = height * ratio;
    return { x: (width - cropWidth) / 2, y: 0, width: cropWidth, height };
  }
  const cropHeight = width / ratio;
  return { x: 0, y: (height - cropHeight) / 2, width, height: cropHeight };
}
