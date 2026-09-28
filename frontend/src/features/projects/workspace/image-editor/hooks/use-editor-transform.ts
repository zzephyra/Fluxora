import { useCallback, useState } from "react";

import type { ViewTransform } from "../types";
import { clampPan, zoomAt } from "../utils/coordinates";

const INITIAL = { zoom: 1, panX: 0, panY: 0, rotation: 0 };

export function useEditorTransform() {
  const [transform, setTransform] = useState(INITIAL);

  const viewFor = useCallback(
    (stageWidth: number, stageHeight: number, imageWidth: number, imageHeight: number): ViewTransform => ({
      stageWidth,
      stageHeight,
      imageWidth,
      imageHeight,
      ...transform,
    }),
    [transform],
  );

  const zoomBy = useCallback((view: ViewTransform, factor: number, screenX: number, screenY: number) => {
    const next = zoomAt(view, view.zoom * factor, screenX, screenY);
    const pan = clampPan(next, next.panX, next.panY);
    setTransform({ zoom: next.zoom, panX: pan.panX, panY: pan.panY, rotation: next.rotation });
  }, []);

  const panBy = useCallback((view: ViewTransform, dx: number, dy: number) => {
    setTransform((current) => {
      const pan = clampPan({ ...view, zoom: current.zoom }, current.panX + dx, current.panY + dy);
      return { ...current, panX: pan.panX, panY: pan.panY };
    });
  }, []);

  const resetView = useCallback(() => {
    setTransform(INITIAL);
  }, []);

  return { viewFor, zoomBy, panBy, resetView };
}
