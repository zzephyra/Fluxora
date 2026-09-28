export type ImageMime = "image/png" | "image/jpeg" | "image/webp";

export function renderImage(source: CanvasImageSource, width: number, height: number, mime: ImageMime): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }
  if (mime === "image/jpeg") {
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function exportImage(source: CanvasImageSource, width: number, height: number, mime: ImageMime): Promise<Blob> {
  const canvas = renderImage(source, width, height, mime);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("图片导出失败"));
          return;
        }
        resolve(blob);
      },
      mime,
      mime === "image/png" ? undefined : 0.92,
    );
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
