import type { ClipData, Composition } from "./api";
import { clamp, MAX_FRAMES, snap } from "./time";
export const clipsOf = (doc: Composition) => doc.tracks[0].clips;
export function withClips(doc: Composition, clips: ClipData[]): Composition {
  return { ...doc, duration_in_frames: Math.max(doc.duration_in_frames, ...clips.map(c => c.timeline_start_frame + c.duration)), tracks: [{ id: "video", type: "video", clips: [...clips].sort((a, b) => a.timeline_start_frame - b.timeline_start_frame) }] };
}
export function splitClip(doc: Composition, id: string, frame: number, newId: string): Composition {
  const clip = clipsOf(doc).find(c => c.id === id);
  if (!clip || frame <= clip.timeline_start_frame || frame >= clip.timeline_start_frame + clip.duration) return doc;
  const offset = frame - clip.timeline_start_frame;
  return withClips(doc, clipsOf(doc).flatMap(c => c.id !== id ? [c] : [
    { ...c, duration: offset, source_end_frame: c.source_start_frame + offset },
    { ...c, id: newId, timeline_start_frame: frame, source_start_frame: c.source_start_frame + offset, duration: c.duration - offset },
  ]));
}
export function removeClip(doc: Composition, id: string) { return withClips(doc, clipsOf(doc).filter(c => c.id !== id)); }
export function editClip(doc: Composition, id: string, delta: number, mode: "move" | "left" | "right", playhead: number, scale: number, snapping: boolean): Composition {
  const clips = clipsOf(doc);
  const clip = clips.find(c => c.id === id);
  if (!clip) return doc;
  const others = clips.filter(c => c.id !== id);
  const before = Math.max(0, ...others.filter(c => c.timeline_start_frame < clip.timeline_start_frame).map(c => c.timeline_start_frame + c.duration));
  const after = Math.min(MAX_FRAMES, ...others.filter(c => c.timeline_start_frame > clip.timeline_start_frame).map(c => c.timeline_start_frame));
  const points = [0, playhead, ...others.flatMap(c => [c.timeline_start_frame, c.timeline_start_frame + c.duration])];
  let next = { ...clip };
  if (mode === "move") {
    let start = clip.timeline_start_frame + delta;
    if (snapping) start = snap(start, [...points, ...points.map(p => p - clip.duration)], scale);
    next.timeline_start_frame = clamp(start, before, after - clip.duration);
  } else if (mode === "left") {
    let start = clip.timeline_start_frame + delta;
    if (snapping) start = snap(start, points, scale);
    const shift = clamp(start, Math.max(before, clip.timeline_start_frame - clip.source_start_frame), clip.timeline_start_frame + clip.duration - 1) - clip.timeline_start_frame;
    next = { ...clip, timeline_start_frame: clip.timeline_start_frame + shift, source_start_frame: clip.source_start_frame + shift, duration: clip.duration - shift };
  } else {
    let end = clip.timeline_start_frame + clip.duration + delta;
    if (snapping) end = snap(end, points, scale);
    const maxEnd = Math.min(after, clip.timeline_start_frame + clip.original_duration - clip.source_start_frame);
    const duration = clamp(end, clip.timeline_start_frame + 1, maxEnd) - clip.timeline_start_frame;
    next = { ...clip, duration, source_end_frame: clip.source_start_frame + duration };
  }
  return withClips(doc, clips.map(c => c.id === id ? next : c));
}
