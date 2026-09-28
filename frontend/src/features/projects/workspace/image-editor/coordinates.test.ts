import { describe, expect, it } from "vitest";

import type { ViewTransform } from "./types";
import { fitScale, fixedCropFrame, imageCropFromFrame, imageToScreen, MAX_ZOOM, MIN_ZOOM, screenToImage, zoomAt } from "./utils/coordinates";
import { cropGesture } from "./utils/hits";
import { rotateStroke } from "./utils/strokes";

const view: ViewTransform = {
  stageWidth: 800,
  stageHeight: 600,
  imageWidth: 400,
  imageHeight: 200,
  zoom: 1,
  panX: 0,
  panY: 0,
  rotation: 0,
};

describe("image editor coordinates", () => {
  it("maps the image center into the usable preview area", () => {
    const point = imageToScreen(200, 100, view);
    expect(point.x).toBeCloseTo(400);
    expect(point.y).toBeGreaterThan(200);
    expect(point.y).toBeLessThan(400);
  });

  it("fills the limiting side of the usable preview", () => {
    const scale = fitScale(view);
    const boxWidth = 800 - 56;
    const boxHeight = 600 - 104;
    expect(Math.max((400 * scale) / boxWidth, (200 * scale) / boxHeight)).toBeCloseTo(1);
  });

  it("keeps a screen point on the same image pixel after zoom", () => {
    const anchor = { x: 260, y: 180 };
    const before = screenToImage(anchor.x, anchor.y, view);
    const zoomed = zoomAt(view, 2, anchor.x, anchor.y);
    const after = screenToImage(anchor.x, anchor.y, zoomed);
    expect(zoomed.zoom).toBe(MAX_ZOOM);
    expect(zoomed.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("keeps the crop frame still while the image is panned", () => {
    const still = fixedCropFrame(view, null);
    const panned = fixedCropFrame({ ...view, panX: 40, panY: -20, zoom: 1.2 }, null);
    expect(panned).toEqual(still);
    const fitted = imageCropFromFrame(view, still);
    expect(fitted.x).toBeCloseTo(0);
    expect(fitted.y).toBeCloseTo(0);
    expect(fitted.width).toBeCloseTo(400);
    expect(fitted.height).toBeCloseTo(200);
  });
  it("hits the crop box and its corner in screen space", () => {
    const rect = { x: 40, y: 20, width: 320, height: 160 };
    const center = imageToScreen(200, 100, view);
    const corner = imageToScreen(rect.x, rect.y, view);
    expect(cropGesture(center.x, center.y, rect, view)).toBe("move");
    expect(cropGesture(corner.x, corner.y, rect, view)).toBe("nw");
  });

  it("rotates a mask point with the image", () => {
    const stroke = rotateStroke({ id: "s", mode: "add", width: 10, points: [0, 0] }, 400, 200, 90);
    expect(stroke.points[0]).toBeCloseTo(200);
    expect(stroke.points[1]).toBeCloseTo(0);
  });
});
