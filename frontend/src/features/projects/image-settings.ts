export const RESOLUTIONS = [
  ["1k", "标清 1K"],
  ["2k", "高清 2K"],
] as const;

export const RATIOS = [
  ["auto", "智能"],
  ["9:16", "9:16"],
  ["2:3", "2:3"],
  ["3:4", "3:4"],
  ["1:1", "1:1"],
  ["4:3", "4:3"],
  ["3:2", "3:2"],
  ["16:9", "16:9"],
  ["21:9", "21:9"],
] as const;

export const COUNTS = [1, 2, 3, 4] as const;

export type ResolutionId = (typeof RESOLUTIONS)[number][0];
export type RatioId = (typeof RATIOS)[number][0];

const SIZES: Record<string, string> = {
  "1k|1:1": "1024x1024",
  "1k|3:4": "864x1152",
  "1k|4:3": "1152x864",
  "1k|16:9": "1280x720",
  "1k|9:16": "720x1280",
  "1k|3:2": "1248x832",
  "1k|2:3": "832x1248",
  "1k|21:9": "1568x672",
  "2k|1:1": "2048x2048",
  "2k|3:4": "1536x2048",
  "2k|4:3": "2048x1536",
  "2k|16:9": "2048x1152",
  "2k|9:16": "1152x2048",
  "2k|3:2": "2048x1366",
  "2k|2:3": "1366x2048",
  "2k|21:9": "2048x878",
};

export type ImageParameters = {
  n: number;
  size?: string;
};

export function imageParameters(
  resolution: ResolutionId,
  ratio: RatioId,
  count: number,
): ImageParameters {
  if (ratio === "auto") {
    return { n: count };
  }
  return { n: count, size: SIZES[`${resolution}|${ratio}`] };
}

export function settingsSummary(resolution: ResolutionId, ratio: RatioId, count: number): string {
  const ratioLabel = RATIOS.find(([value]) => value === ratio)?.[1] ?? ratio;
  if (ratio === "auto") {
    return `${ratioLabel} · ${count}`;
  }
  const resolutionLabel = RESOLUTIONS.find(([value]) => value === resolution)?.[1] ?? resolution;
  return `${resolutionLabel} · ${ratioLabel} · ${count}`;
}
