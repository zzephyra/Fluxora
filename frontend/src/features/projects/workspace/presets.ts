/** Local fallback catalog. Replace through a project-scoped API when available. */
export type CreativePreset = { id: string; label: string; description: string; prompt: string; kind: "story" | "brand" | "world" | "shot" };
export const creativePresets: readonly CreativePreset[] = [
  { id: "story", kind: "story", label: "把灵感写成故事", description: "从一个念头，找到叙事方向", prompt: "我想创作一支有电影感的短片。请先帮我梳理故事主题、主角和情绪走向，再一起确定画面风格。我的初步想法是：" },
  { id: "brand", kind: "brand", label: "构思一支品牌短片", description: "让产品拥有自己的表达", prompt: "我想为一个品牌构思短片。请引导我明确受众、产品亮点和视觉风格，并整理三个创意方向。品牌与产品信息：" },
  { id: "world", kind: "world", label: "创造一个角色世界", description: "建立角色、场景与视觉语言", prompt: "请帮我设计一个独特的角色与世界观。我们先讨论角色外形、背景、场景和色彩，再整理可复用的视觉设定。故事发生在：" },
  { id: "shot", kind: "shot", label: "拆解我的镜头想法", description: "把脑海的画面变成镜头描述", prompt: "我脑海里有一个画面，请帮我从景别、镜头运动、光线、构图和色彩五个方面细化，最后整理成生成提示词。画面是：" },
];
