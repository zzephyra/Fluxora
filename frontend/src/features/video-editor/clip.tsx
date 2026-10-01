import { useDraggable } from "@dnd-kit/core";
import type { PointerEvent } from "react";
import type { ClipData } from "./api";
import { ThumbnailStrip } from "./thumbnail-strip";
import { useEditor, useEditorStore } from "./store";
import { editClip } from "./edits";
import { pixelToFrame, timecode } from "./time";
export function TrimHandle({
  id,
  side,
}: {
  id: string;
  side: "left" | "right";
}) {
  const store = useEditorStore();
  function start(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    event.preventDefault();
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    const state = store.getState();
    const before = state.draft;
    const x = event.clientX;
    state.setPlaying(false);
    state.select(id);
    const move = (e: globalThis.PointerEvent) =>
      store.getState().preview({
        ...before,
        composition: editClip(
          before.composition,
          id,
          pixelToFrame(e.clientX - x, state.scale),
          side,
          state.frame,
          state.scale,
          state.snapping,
        ),
      });
    const finish = (e: globalThis.PointerEvent) => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", finish);
      element.removeEventListener("pointercancel", finish);
      if (e.type === "pointercancel") store.getState().preview(before);
      else store.getState().commitGesture(before);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", finish);
    element.addEventListener("pointercancel", finish);
  }
  return (
    <button
      type="button"
      className={`ve-trim ve-trim-${side}`}
      aria-label={side === "left" ? "裁剪起点" : "裁剪终点"}
      onPointerDown={start}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        event.stopPropagation();
        const s = store.getState();
        s.edit({
          ...s.draft,
          composition: editClip(
            s.draft.composition,
            id,
            event.key === "ArrowLeft" ? -1 : 1,
            side,
            s.frame,
            s.scale,
            false,
          ),
        });
      }}
    />
  );
}
export function Clip({
  clip,
  projectId,
  viewLeft,
  viewWidth,
}: {
  clip: ClipData;
  projectId: string;
  viewLeft: number;
  viewWidth: number;
}) {
  const scale = useEditor((s) => s.scale);
  const selected = useEditor((s) => s.selected === clip.id);
  const store = useEditorStore();
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: clip.id });
  return (
    <div
      ref={setNodeRef}
      className={`ve-clip ${selected ? "is-selected" : ""} ${isDragging ? "is-dragging" : ""}`}
      style={{
        left: clip.timeline_start_frame * scale,
        width: clip.duration * scale,
        transform: transform ? `translateX(${transform.x}px)` : undefined,
      }}
    >
      <button
        type="button"
        className="ve-clip-body"
        {...attributes}
        {...listeners}
        aria-label={`视频片段 ${timecode(clip.timeline_start_frame)}，时长 ${timecode(clip.duration)}`}
        aria-pressed={selected}
        onClick={() => store.getState().select(clip.id)}
        onFocus={() => store.getState().select(clip.id)}
      >
        <ThumbnailStrip
          clip={clip}
          projectId={projectId}
          scale={scale}
          viewLeft={viewLeft}
          viewWidth={viewWidth}
        />
        <span className="ve-clip-label">视频 · {timecode(clip.duration)}</span>
      </button>
      <TrimHandle id={clip.id} side="left" />
      <TrimHandle id={clip.id} side="right" />
    </div>
  );
}
