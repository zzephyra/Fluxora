import { useCallback, useMemo, useState } from "react";

import type { EditorAction, EditorDocument } from "../types";
import { replay } from "../utils/document";

export function useEditorHistory(source: CanvasImageSource | null, width: number, height: number) {
  const [actions, setActions] = useState<EditorAction[]>([]);
  const [index, setIndex] = useState(0);

  const documentState = useMemo<EditorDocument | null>(() => {
    if (!source || width <= 0 || height <= 0) {
      return null;
    }
    return replay(source, width, height, actions, index);
  }, [actions, height, index, source, width]);

  const commit = useCallback((action: EditorAction) => {
    setActions((current) => [...current.slice(0, index), action]);
    setIndex((current) => current + 1);
  }, [index]);

  const undo = useCallback(() => {
    setIndex((current) => Math.max(0, current - 1));
  }, []);

  const redo = useCallback(() => {
    setIndex((current) => Math.min(actions.length, current + 1));
  }, [actions.length]);

  const reset = useCallback(() => {
    setActions([]);
    setIndex(0);
  }, []);

  return {
    documentState,
    commit,
    undo,
    redo,
    reset,
    canUndo: index > 0,
    canRedo: index < actions.length,
  };
}
