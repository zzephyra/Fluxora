/** Public branding. Persistent storage and authentication identifiers remain compatible. */
export const brand = {
  name: "Lumi",
  company: "Lumisene",
  domain: "lumisene.com",
  siteUrl: (import.meta.env.VITE_SITE_URL || "https://lumisene.com").replace(/\/$/, ""),
  tagline: "Imagine it. Lumi brings it to life.",
  taglineZh: "想象，即刻成真。",
  shortTagline: "Bring ideas to life.",
  title: "Lumi — AI Image & Video Creative Studio",
  description: "Create, edit, and transform images and videos with Lumi, an AI-powered creative workspace by Lumisene.",
  descriptionZh: "从灵感、文字与参考素材出发，在一个 AI 创作空间中生成、编辑和塑造图片与视频。",
  companyDescription: "Lumisene builds creative tools for a new generation of visual storytelling.",
  productDescription: "Lumi is our AI creative workspace for turning ideas into images, motion, and stories.",
} as const;
