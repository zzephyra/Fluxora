import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { useEditor, useEditorStore } from "./store";
import { timecode } from "./time";
export function PlayerControls() {
  const frame = useEditor((s) => s.frame);
  const playing = useEditor((s) => s.playing);
  const duration = useEditor((s) => s.draft.composition.duration_in_frames);
  const store = useEditorStore();
  const seek = (target: number) => {
    store.getState().setPlaying(false);
    store.getState().seek(target);
  };
  return (
    <div className="ve-player-controls">
      <span>
        {timecode(frame)} <small>/ {timecode(duration)}</small>
      </span>
      <div>
        <Button variant="ghost" aria-label="第一帧" onClick={() => seek(0)}>
          <SkipBack size={16} />
        </Button>
        <Button
          variant="ghost"
          aria-label="上一帧"
          onClick={() => seek(frame - 1)}
        >
          <StepBack size={16} />
        </Button>
        <Button
          variant="ghost"
          aria-label={playing ? "暂停" : "播放"}
          onClick={() => store.getState().setPlaying(!playing)}
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </Button>
        <Button
          variant="ghost"
          aria-label="下一帧"
          onClick={() => seek(frame + 1)}
        >
          <StepForward size={16} />
        </Button>
        <Button
          variant="ghost"
          aria-label="最后一帧"
          onClick={() => seek(duration - 1)}
        >
          <SkipForward size={16} />
        </Button>
      </div>
      <small>30 FPS</small>
    </div>
  );
}
