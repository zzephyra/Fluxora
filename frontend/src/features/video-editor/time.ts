export const MAX_FRAMES = 18000;
export const frameToPixel = (frame: number, pixelsPerFrame: number) => frame * pixelsPerFrame;
export const pixelToFrame = (pixel: number, pixelsPerFrame: number) => Math.round(pixel / pixelsPerFrame);
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export function timecode(frame: number, fps = 30) {
  const seconds = Math.floor(frame / fps);
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}:${(frame % fps).toString().padStart(2, "0")}`;
}
export function snap(frame: number, points: number[], pixelsPerFrame: number, tolerance = 8) {
  const closest = points.reduce((best, point) => Math.abs(point - frame) < Math.abs(best - frame) ? point : best, Infinity);
  return Math.abs(closest - frame) * pixelsPerFrame <= tolerance ? closest : frame;
}
