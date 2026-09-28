import { Player, type PlayerRef } from "@remotion/player";
import { AbsoluteFill, Html5Video, Sequence } from "remotion";
import { useEffect, useRef } from "react";
import type { Composition } from "./api";
import { mediaUrl } from "./api";
import { useEditor, useEditorStore } from "./store";
function VideoComposition({ composition, projectId }: { composition: Composition; projectId: string }) {
  return <AbsoluteFill style={{ backgroundColor: "black" }}>{composition.tracks[0].clips.map(clip => <Sequence key={clip.id} from={clip.timeline_start_frame} durationInFrames={clip.duration}><Html5Video src={mediaUrl(projectId, clip.asset_id)} trimBefore={clip.source_start_frame} trimAfter={clip.source_end_frame} volume={clip.volume} muted={clip.muted} pauseWhenBuffering style={{ width: "100%", height: "100%", objectFit: "contain" }} /></Sequence>)}</AbsoluteFill>;
}
export function VideoPlayer({ projectId }: { projectId: string }) {
  const composition = useEditor(s => s.draft.composition);
  const store = useEditorStore();
  const ref = useRef<PlayerRef>(null);
  useEffect(() => {
    const player = ref.current; if (!player) return;
    let fromPlayer = false;
    const onFrame = (event: { detail: { frame: number } }) => { fromPlayer = true; store.getState().seek(event.detail.frame); fromPlayer = false; };
    const onPlay = () => store.getState().setPlaying(true);
    const onPause = () => store.getState().setPlaying(false);
    player.addEventListener("frameupdate", onFrame); player.addEventListener("play", onPlay); player.addEventListener("pause", onPause); player.addEventListener("ended", onPause);
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.frame !== previous.frame && !fromPlayer) player.seekTo(state.frame);
      if (state.playing !== previous.playing) { if (state.playing) player.play(); else player.pause(); }
    });
    return () => { unsubscribe(); player.removeEventListener("frameupdate", onFrame); player.removeEventListener("play", onPlay); player.removeEventListener("pause", onPause); player.removeEventListener("ended", onPause); };
  }, [store]);
  return <Player ref={ref} component={VideoComposition} inputProps={{ composition, projectId }} durationInFrames={composition.duration_in_frames} compositionWidth={composition.width} compositionHeight={composition.height} fps={composition.fps} controls={false} clickToPlay={false} spaceKeyToPlayOrPause={false} style={{ width: "100%", height: "100%" }} errorFallback={() => <p role="alert">视频预览失败，请确认素材仍可访问并重新打开工程。</p>} />;
}
