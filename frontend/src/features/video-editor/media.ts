/** One decoder at a time; 160 cached JPEGs; caller cancellation releases media. */
const cache = new Map<string, string>();
let tail: Promise<unknown> = Promise.resolve();
function waitFor(video: HTMLVideoElement, event: string, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => { clearTimeout(timer); video.removeEventListener(event, ready); video.removeEventListener("error", failed); signal?.removeEventListener("abort", aborted); error ? reject(error) : resolve(); };
    const ready = () => finish();
    const failed = () => finish(new Error("视频无法读取"));
    const aborted = () => finish(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(() => finish(new Error("视频读取超时")), 20000);
    video.addEventListener(event, ready, { once: true }); video.addEventListener("error", failed, { once: true }); signal?.addEventListener("abort", aborted, { once: true });
    if (signal?.aborted) aborted();
  });
}
function release(video: HTMLVideoElement) { video.pause(); video.removeAttribute("src"); video.load(); }
export async function inspectMedia(url: string, signal?: AbortSignal) {
  const video = document.createElement("video"); video.preload = "metadata";
  try {
    const loaded = waitFor(video, "loadedmetadata", signal); video.src = url; await loaded;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.duration > 600) throw new Error("仅支持 10 分钟以内的视频");
    return { frames: Math.floor(video.duration * 30 + .001), width: video.videoWidth, height: video.videoHeight };
  } finally { release(video); }
}
export function thumbnail(url: string, frame: number, signal: AbortSignal): Promise<string> {
  const key = `${url}:${frame}`;
  const existing = cache.get(key); if (existing) return Promise.resolve(existing);
  const work = tail.catch(() => undefined).then(async () => {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const hit = cache.get(key); if (hit) return hit;
    const video = document.createElement("video"); video.muted = true; video.preload = "auto";
    try {
      const loaded = waitFor(video, "loadeddata", signal); video.src = url; await loaded;
      const target = Math.min(frame / 30, Math.max(0, video.duration - .04));
      if (Math.abs(video.currentTime - target) > .001) { const sought = waitFor(video, "seeked", signal); video.currentTime = target; await sought; }
      const canvas = document.createElement("canvas"); canvas.width = 128; canvas.height = 72;
      const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("无法生成缩略图");
      ctx.drawImage(video, 0, 0, 128, 72); const image = canvas.toDataURL("image/jpeg", .65);
      cache.set(key, image); if (cache.size > 160) cache.delete(cache.keys().next().value!);
      return image;
    } finally { release(video); }
  });
  tail = work.catch(() => undefined);
  return work;
}
export function clearThumbnails() { cache.clear(); }
