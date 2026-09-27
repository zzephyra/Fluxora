# ADR-015: 独立官网展示层

## Status

Accepted — 2026-09-27，依据用户要求参考 Kling、Pika、Luma 设计具有丰富交互的 Fluxora 官网。

## Decision

在既有 React 工程增加公开 `/` 首页及 landing feature，复用 Button、Dialog、React Router 和现有依赖，不更换技术栈。官网样式仍限定在 `.landing`。随后按用户要求，登录页和工作台改用同一套深色表面，颜色写在全局样式入口，不再保留浅色工作台 token。不接入新数据源或发布到新托管平台。

官网交互包括画廊筛选、详情与提示词复制、流程切换、FAQ、移动导航和临时草稿。草稿刷新丢失，页面明确说明；不模拟付费生成、排队或已保存业务数据。品牌主视觉由 imagegen 创建，其他图片仅作为带说明的情绪参考，非平台作品。

## Consequences

主 CTA 沿用已有项目路由和认证。所有官网样式限定作用域，弹窗沿用 Radix 焦点管理；动效支持 reduced motion。新增官网行为测试，构建与既有测试通过后才交付。
