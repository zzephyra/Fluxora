# ADR-027: 按媒体类型统一模型指定

## Status

Accepted — 2026-09-30。用户明确要求所有图片操作复用图片生成模型，所有视频操作复用视频生成模型，并确认按此方案完善局部重绘。

## Decision

- 图片统一解析 `text_to_image`，视频统一解析 `text_to_video`；保留这两个既有配置键，UI 展示“图片生成”“视频生成”。操作类型仍区分 text_to_image/image_inpaint/text_to_video/image_to_video，不增加选择模型步骤。
- image_inpaint/image_to_video 不再作为独立指定或新配置类别。历史配置、指定和任务保留，但历史独立指定不参与新请求；不隐式迁移覆盖现有统一指定。已排队任务继续使用提交时模型快照。
- 统一模型不代表供应商能力通用。不支持的操作明确拒绝，禁止暗中切换到另一模型。
- 当前 qwen-image-3.0 / pro 使用其 images/generations 扩展 image 字段进行真实图片编辑，传入原图及黑白选区参考图，通过描述约定选区。供应商不支持原生 mask，所以应用对编辑结果执行蒙版合成，保证未选区像素不变；选区内语义效果仍取决于模型。OpenAI 已适配图片模型继续走原生 edits/mask。
- 重绘 Worker 根据任务输入/操作分流，不能根据模型配置类别判断是否重绘，否则共用图片模型后会错误进入文生图。
- 不改变状态机、项目隔离和持久化结构；更新 API 行为说明及测试。

本决策替代 ADR-019、ADR-026 中按每个图片/视频操作单独指定模型的要求。

协议依据：[Qwen Image 3.0 官方接口](https://help.aliyun.com/zh/model-studio/qwen-image-generation-and-editing-api-reference)。
