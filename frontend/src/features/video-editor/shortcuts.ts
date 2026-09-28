import { useEffect } from "react";
import { useEditorStore } from "./store";
import { removeClip, splitClip } from "./edits";
export function isTextInput(target: EventTarget | null) { return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable=true], [role=dialog]")); }
export function useEditorShortcuts() {
  const store = useEditorStore();
  useEffect(() => { const handler = (e: KeyboardEvent) => {
    if (isTextInput(e.target)) return;
    const s = store.getState(); const modifier = e.metaKey || e.ctrlKey;
    if (modifier && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? s.redo() : s.undo(); }
    else if (modifier && e.key.toLowerCase() === "y") { e.preventDefault(); s.redo(); }
    else if (e.code === "Space") { e.preventDefault(); s.setPlaying(!s.playing); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowRight") { if ((e.target as HTMLElement)?.closest(".ve-trim")) return; e.preventDefault(); s.setPlaying(false); s.seek(s.frame + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10 : 1)); }
    else if ((e.key === "Delete" || e.key === "Backspace") && s.selected) { e.preventDefault(); s.edit({ ...s.draft, composition: removeClip(s.draft.composition, s.selected) }); s.select(null); }
    else if (e.key.toLowerCase() === "s" && !modifier && s.selected) { e.preventDefault(); s.edit({ ...s.draft, composition: splitClip(s.draft.composition, s.selected, s.frame, crypto.randomUUID()) }); }
  }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [store]);
}
