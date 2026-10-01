import { Magnet, Minus, Plus, Scissors, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { useEditor, useEditorStore } from "./store";
import { removeClip, splitClip } from "./edits";
export function ZoomControl() {
  const scale = useEditor((s) => s.scale);
  const store = useEditorStore();
  return (
    <div className="ve-zoom">
      <Button
        variant="ghost"
        aria-label="缩小时间线"
        onClick={() => store.getState().setScale(scale / 1.4)}
      >
        <Minus size={14} />
      </Button>
      <input
        aria-label="时间线缩放"
        type="range"
        min="0.25"
        max="12"
        step="0.25"
        value={scale}
        onChange={(e) => store.getState().setScale(Number(e.target.value))}
      />
      <Button
        variant="ghost"
        aria-label="放大时间线"
        onClick={() => store.getState().setScale(scale * 1.4)}
      >
        <Plus size={14} />
      </Button>
      <span>{Math.round(scale * 30)} px/s</span>
    </div>
  );
}
export function EditorToolbar() {
  const selected = useEditor((s) => s.selected);
  const canSplit = useEditor((s) => {
    const clip = s.draft.composition.tracks[0].clips.find(
      (c) => c.id === s.selected,
    );
    return Boolean(
      clip &&
        s.frame > clip.timeline_start_frame &&
        s.frame < clip.timeline_start_frame + clip.duration,
    );
  });
  const snapping = useEditor((s) => s.snapping);
  const store = useEditorStore();
  return (
    <div className="ve-toolbar">
      <div>
        <Button
          variant="ghost"
          disabled={!canSplit}
          title="在播放头处分割 (S)"
          onClick={() => {
            const s = store.getState();
            if (s.selected)
              s.edit({
                ...s.draft,
                composition: splitClip(
                  s.draft.composition,
                  s.selected,
                  s.frame,
                  crypto.randomUUID(),
                ),
              });
          }}
        >
          <Scissors size={16} /> 分割
        </Button>
        <Button
          variant="ghost"
          disabled={!selected}
          aria-label="删除选中片段"
          onClick={() => {
            const s = store.getState();
            if (s.selected) {
              s.edit({
                ...s.draft,
                composition: removeClip(s.draft.composition, s.selected),
              });
              s.select(null);
            }
          }}
        >
          <Trash2 size={16} />
        </Button>
        <i />
        <Button
          variant="ghost"
          aria-pressed={snapping}
          onClick={() => store.getState().toggleSnap()}
        >
          <Magnet size={16} /> 吸附{snapping ? "开" : "关"}
        </Button>
      </div>
      <ZoomControl />
    </div>
  );
}
