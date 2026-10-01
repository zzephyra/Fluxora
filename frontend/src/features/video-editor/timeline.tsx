import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Film } from "lucide-react";
import { Clip } from "./clip";
import { useEditor, useEditorStore } from "./store";
import { editClip } from "./edits";
import { pixelToFrame, timecode } from "./time";
import { EditorToolbar } from "./toolbar";
function Playhead() {
  const frame = useEditor((s) => s.frame);
  const scale = useEditor((s) => s.scale);
  const store = useEditorStore();
  function drag(event: PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    event.preventDefault();
    const element = event.currentTarget;
    const rect = element.parentElement!.getBoundingClientRect();
    element.setPointerCapture(event.pointerId);
    store.getState().setPlaying(false);
    const move = (e: globalThis.PointerEvent) =>
      store.getState().seek(pixelToFrame(e.clientX - rect.left, scale));
    const end = () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", end);
      element.removeEventListener("pointercancel", end);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
  }
  return (
    <div
      className="ve-playhead"
      style={{ left: frame * scale }}
      onPointerDown={drag}
      role="slider"
      aria-label="播放头"
      aria-valuemin={0}
      aria-valuemax={useEditor(
        (s) => s.draft.composition.duration_in_frames - 1,
      )}
      aria-valuenow={frame}
      tabIndex={0}
    >
      <span />
    </div>
  );
}
function TimelineRuler({
  width,
  left,
  viewport,
}: {
  width: number;
  left: number;
  viewport: number;
}) {
  const scale = useEditor((s) => s.scale);
  const step =
    [1, 5, 10, 15, 30, 60, 150, 300, 600].find((f) => f * scale >= 70) ?? 600;
  const start = Math.floor(left / (step * scale));
  const end = Math.min(
    Math.ceil(width / (step * scale)),
    Math.ceil((left + viewport) / (step * scale)),
  );
  return (
    <div className="ve-ruler">
      {Array.from(
        { length: Math.max(0, end - start + 1) },
        (_, i) => i + start,
      ).map((i) => (
        <span key={i} style={{ left: i * step * scale }}>
          {timecode(i * step)}
        </span>
      ))}
    </div>
  );
}
export function Timeline({ projectId }: { projectId: string }) {
  const composition = useEditor((s) => s.draft.composition);
  const scale = useEditor((s) => s.scale);
  const store = useEditorStore();
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ left: 0, width: 800 });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const width = Math.max(
    view.width,
    (composition.duration_in_frames + 90) * scale,
  );
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const update = () =>
      setView({ left: el.scrollLeft, width: el.clientWidth });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    el.addEventListener("scroll", update);
    update();
    const unsubscribe = store.subscribe((s, previous) => {
      if (s.frame === previous.frame || !s.playing) return;
      const x = s.frame * s.scale;
      if (x > el.scrollLeft + el.clientWidth - 80 || x < el.scrollLeft)
        el.scrollLeft = Math.max(0, x - 80);
    });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", update);
      unsubscribe();
    };
  }, [store]);
  function seek(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    store.getState().setPlaying(false);
    const move = (clientX: number) =>
      store.getState().seek(pixelToFrame(clientX - rect.left, scale));
    move(event.clientX);
    el.setPointerCapture(event.pointerId);
    const onMove = (e: globalThis.PointerEvent) => move(e.clientX);
    const end = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }
  return (
    <section className="ve-timeline" aria-label="视频时间线">
      <EditorToolbar />
      <div className="ve-timeline-body">
        <div className="ve-track-heading">
          <span>轨道</span>
          <div>
            <Film size={16} /> 视频 01
          </div>
          <small>单轨 · 保留空隙</small>
        </div>
        <div className="ve-timeline-viewport" ref={viewport}>
          <DndContext
            sensors={sensors}
            modifiers={[
              ({ transform, active }) => {
                if (!active) return transform;
                const s = store.getState();
                const clip = s.draft.composition.tracks[0].clips.find(
                  (c) => c.id === active.id,
                );
                if (!clip) return transform;
                const adjusted = editClip(
                  s.draft.composition,
                  clip.id,
                  pixelToFrame(transform.x, scale),
                  "move",
                  s.frame,
                  scale,
                  s.snapping,
                ).tracks[0].clips.find((c) => c.id === clip.id)!;
                return {
                  ...transform,
                  x:
                    (adjusted.timeline_start_frame -
                      clip.timeline_start_frame) *
                    scale,
                  y: 0,
                };
              },
            ]}
            onDragStart={(event) => {
              store.getState().setPlaying(false);
              store.getState().select(String(event.active.id));
            }}
            onDragEnd={(event) => {
              const s = store.getState();
              s.edit({
                ...s.draft,
                composition: editClip(
                  s.draft.composition,
                  String(event.active.id),
                  pixelToFrame(event.delta.x, scale),
                  "move",
                  s.frame,
                  scale,
                  s.snapping,
                ),
              });
            }}
          >
            <div
              className="ve-timeline-content"
              style={{ width }}
              onPointerDown={seek}
            >
              <TimelineRuler
                width={width}
                left={view.left}
                viewport={view.width}
              />
              <div className="ve-video-track">
                {composition.tracks[0].clips
                  .filter(
                    (c) =>
                      (c.timeline_start_frame + c.duration) * scale >=
                        view.left - 100 &&
                      c.timeline_start_frame * scale <=
                        view.left + view.width + 100,
                  )
                  .map((clip) => (
                    <Clip
                      key={clip.id}
                      clip={clip}
                      projectId={projectId}
                      viewLeft={view.left}
                      viewWidth={view.width}
                    />
                  ))}
              </div>
              <Playhead />
            </div>
          </DndContext>
        </div>
      </div>
      <footer>
        空格 播放 / 暂停{" "}
        <span>
          ← → 逐帧 · Shift 加速 · S 分割 · Delete 删除 · ⌘/Ctrl Z 撤销
        </span>
      </footer>
    </section>
  );
}
