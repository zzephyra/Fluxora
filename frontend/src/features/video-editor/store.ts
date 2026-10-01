import { createContext, useContext } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { Composition, EditorDocument } from "./api";
import { clamp } from "./time";
export type Draft = { title: string; composition: Composition };
export type EditorState = {
  draft: Draft;
  saved: Draft;
  version: number;
  past: Draft[];
  future: Draft[];
  selected: string | null;
  frame: number;
  playing: boolean;
  scale: number;
  snapping: boolean;
  edit: (draft: Draft) => void;
  preview: (draft: Draft) => void;
  commitGesture: (before: Draft) => void;
  undo: () => void;
  redo: () => void;
  select: (id: string | null) => void;
  seek: (frame: number) => void;
  setPlaying: (playing: boolean) => void;
  setScale: (scale: number) => void;
  toggleSnap: () => void;
  markSaved: (draft: Draft, version: number) => void;
};
export function createEditorStore(document: EditorDocument) {
  const initial = { title: document.title, composition: document.composition };
  return createStore<EditorState>((set, get) => ({
    draft: initial,
    saved: initial,
    version: document.version,
    past: [],
    future: [],
    selected: null,
    frame: 0,
    playing: false,
    scale: 3,
    snapping: true,
    edit: (draft) => {
      const s = get();
      if (JSON.stringify(s.draft) !== JSON.stringify(draft))
        set({ draft, past: [...s.past.slice(-99), s.draft], future: [] });
    },
    preview: (draft) => set({ draft }),
    commitGesture: (before) => {
      const s = get();
      if (JSON.stringify(before) !== JSON.stringify(s.draft))
        set({ past: [...s.past.slice(-99), before], future: [] });
      else set({ draft: before });
    },
    undo: () => {
      const s = get();
      const draft = s.past.at(-1);
      if (draft)
        set({
          draft,
          past: s.past.slice(0, -1),
          future: [s.draft, ...s.future],
          selected: null,
          frame: clamp(s.frame, 0, draft.composition.duration_in_frames - 1),
        });
    },
    redo: () => {
      const s = get();
      const draft = s.future[0];
      if (draft)
        set({
          draft,
          past: [...s.past, s.draft],
          future: s.future.slice(1),
          selected: null,
          frame: clamp(s.frame, 0, draft.composition.duration_in_frames - 1),
        });
    },
    select: (selected) => set({ selected }),
    seek: (frame) =>
      set({
        frame: clamp(
          Math.round(frame),
          0,
          get().draft.composition.duration_in_frames - 1,
        ),
      }),
    setPlaying: (playing) => set({ playing }),
    setScale: (scale) => set({ scale: clamp(scale, 0.25, 12) }),
    toggleSnap: () => set({ snapping: !get().snapping }),
    markSaved: (saved, version) => set({ saved, version }),
  }));
}
export type EditorStore = ReturnType<typeof createEditorStore>;
export const EditorContext = createContext<EditorStore | null>(null);
export function useEditorStore() {
  const store = useContext(EditorContext);
  if (!store) throw new Error("Editor provider missing");
  return store;
}
export function useEditor<T>(selector: (state: EditorState) => T) {
  return useStore(useEditorStore(), selector);
}
