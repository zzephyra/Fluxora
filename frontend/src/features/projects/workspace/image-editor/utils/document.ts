import type { EditorAction, EditorDocument } from "../types";
import { cropStrokes, outpaintStrokes, rotateStroke } from "./strokes";

function canvasFrom(width: number, height: number, draw: (context: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");
  if (context) {
    draw(context);
  }
  return canvas;
}

export function applyAction(documentState: EditorDocument, action: EditorAction): EditorDocument {
  if (action.type === "mask-clear") {
    return { ...documentState, strokes: [] };
  }
  if (action.type === "mask-add" || action.type === "mask-remove") {
    return { ...documentState, strokes: [...documentState.strokes, action.payload] };
  }
  if (action.type === "crop") {
    const rect = action.payload;
    const source = canvasFrom(rect.width, rect.height, (context) => {
      context.drawImage(documentState.source, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    });
    return { source, width: source.width, height: source.height, strokes: cropStrokes(documentState.strokes, rect) };
  }
  if (action.type === "rotate") {
    const { degrees } = action.payload;
    const width = documentState.height;
    const height = documentState.width;
    const source = canvasFrom(width, height, (context) => {
      if (degrees === 90) {
        context.translate(width, 0);
        context.rotate(Math.PI / 2);
      } else {
        context.translate(0, height);
        context.rotate(-Math.PI / 2);
      }
      context.drawImage(documentState.source, 0, 0);
    });
    return {
      source,
      width: source.width,
      height: source.height,
      strokes: documentState.strokes.map((stroke) => rotateStroke(stroke, documentState.width, documentState.height, degrees)),
    };
  }
  const frame = action.payload;
  const source = canvasFrom(frame.width, frame.height, (context) => {
    context.drawImage(documentState.source, frame.imageX, frame.imageY);
  });
  return {
    source,
    width: source.width,
    height: source.height,
    strokes: outpaintStrokes(documentState.strokes, frame),
  };
}

export function replay(source: CanvasImageSource, width: number, height: number, actions: EditorAction[], index: number): EditorDocument {
  return actions.slice(0, index).reduce<EditorDocument>(
    (documentState, action) => applyAction(documentState, action),
    { source, width, height, strokes: [] },
  );
}
