# ADR-008: Model Gateway 与 LangChain 边界

## Status

Accepted

## Context

文本对话、RAG 和视频生成会接入不同供应商。LangChain 适合模型抽象、提示词、结构化输出和检索组合，但不适合成为权限、计费和任务状态的所在地。视频供应商通常也不是 LangChain Chain。

## Decision

业务 Service 只依赖 Port：

- 文本补全、结构化输出、Embedding：由 LangChain 适配器实现。
- 视频生成：由 Model Gateway 的视频适配器实现，不包装成 Chain、Agent 或 Graph。

```text
Application Service
  → AI Port / VideoGenerationPort
    → Model Gateway
      → Provider Adapter
        → Provider SDK
```

LangChain 代码只位于 `infrastructure` 的文本适配器中。Domain、Router、Worker 和 React 组件不得 import LangChain 或供应商 SDK。

Model Gateway 按能力描述模型：`text_generation`、`embedding`、`text_to_video`、`image_to_video`。公共参数统一；分辨率、时长、参考图等差异保留在该模型的 capability 中。允许的模型、限制和密钥引用存在 PostgreSQL。密钥明文只来自服务端配置。

首期不引入 LangGraph，不实现会自行调用工具、修改记忆或提交生成的 Agent。模型可以提议方案，用户显式提交后才创建生成任务。

检索文本是不可信资料，不能覆盖系统指令、权限或工具策略。提示词模板在后端版本化管理。

## Alternatives

- 业务 Service 直接调用 OpenAI 或视频 SDK。
- 用 LangChain 或 LangGraph 编排整个产品流程。
- 为每个供应商写一套任务状态和参数校验。

## Trade-offs

Port 和 Gateway 是额外边界，但供应商替换不会改动领域规则。把所有调用都放进 LangChain 能少一些适配代码，却会把视频轮询、取消和计费语义塞进 Chain。直接调用 SDK 的首个功能最快，随后每个模块都会出现自己的重试和密钥读取。

## Consequences

新增模型先登记能力和适配器。更换 LangChain 版本或在某个文本场景停用 LangChain，不得修改 Domain。供应商的 429、5xx、超时和网络错误由适配器分类后交给任务重试策略。

## Migration

项目尚未实现，无迁移。
