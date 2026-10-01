import { VideoPlayer } from "./video-player";
import { PlayerControls } from "./player-controls";
export function PreviewPanel({ projectId }: { projectId: string }) {
  return (
    <section className="ve-preview" aria-label="视频预览">
      <div className="ve-panel-heading">
        预览 <span>原始画幅 · 适应窗口</span>
      </div>
      <div className="ve-preview-canvas">
        <VideoPlayer projectId={projectId} />
      </div>
      <PlayerControls />
    </section>
  );
}
