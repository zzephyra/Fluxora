import { useQuery } from "@tanstack/react-query";
import { Film, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { userFacingMessage } from "../../lib/api";
import { listMedia, mediaUrl } from "./api";
import { inspectMedia } from "./media";
import { useEditorStore } from "./store";
import { withClips } from "./edits";
import { MAX_FRAMES } from "./time";
export function MaterialsPanel({ projectId }: { projectId: string }) {
  const media = useQuery({ queryKey: ["projects", projectId, "editor-media"], queryFn: ({ signal }) => listMedia(projectId, signal) });
  const store = useEditorStore(); const [adding, setAdding] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function add(id: string) {
    if (adding) return; setAdding(id); setError(null); controller.current = new AbortController();
    try {
      const info = await inspectMedia(mediaUrl(projectId, id), controller.current.signal);
      const s = store.getState(); const clips = s.draft.composition.tracks[0].clips; const start = Math.max(0, ...clips.map(c => c.timeline_start_frame + c.duration));
      if (start + info.frames > MAX_FRAMES || clips.length >= 100) throw new Error("工程最多 10 分钟、100 个片段");
      const clipId = crypto.randomUUID();
      s.edit({ ...s.draft, composition: withClips(s.draft.composition, [...clips, { id: clipId, asset_id: id, source_start_frame: 0, source_end_frame: info.frames, original_duration: info.frames, timeline_start_frame: start, duration: info.frames, volume: 1, muted: false, speed: 1 }]) }); s.select(clipId); s.seek(start);
    } catch (e) { if (!controller.current?.signal.aborted) setError(userFacingMessage(e)); } finally { setAdding(null); }
  }
  return <aside className="ve-materials"><div className="ve-panel-heading"><span><Film size={15} /> 项目素材</span><Button variant="ghost" onClick={() => void media.refetch()} disabled={media.isFetching}>刷新</Button></div><p className="ve-material-note">添加已有视频，开始编排你的故事</p>{media.isPending && <p role="status">正在加载素材…</p>}{media.isError && <p role="alert">{userFacingMessage(media.error)}</p>}{error && <p role="alert">{error}</p>}<div className="ve-material-list">{media.data?.items.map((asset, i) => <Button key={asset.id} variant="ghost" className="ve-material" disabled={Boolean(adding)} onClick={() => void add(asset.id)}><video muted preload="metadata" src={mediaUrl(projectId, asset.id)} /><span>视频素材 {String(i + 1).padStart(2, "0")}<small>{adding === asset.id ? "读取素材中…" : `${asset.width ?? "—"} × ${asset.height ?? "—"}`}</small></span><Plus size={15} /></Button>)}</div>{media.isSuccess && media.data.items.length === 0 && <p>当前空间暂无视频，请先生成视频。</p>}<div className="ve-material-foot">原始素材安全保留<br />所有操作均为非破坏性编辑</div></aside>;
}
