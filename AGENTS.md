# Agent Rules

修改 Lumi 之前必须阅读：

1. `ARCHITECTURE.md`
2. 与本次变更相关的 `docs/adr/`
3. `docs/specs/README.md` 与受影响主题规范

`ARCHITECTURE.md` 同时约束产品范围与工程实现。与本文冲突时停止，说明冲突，不得自行选择一边继续改代码。

当前基线已确定：

- 视频状态由 Provider 屏蔽 Polling 与 Webhook。首期默认 Polling，不预建 Webhook 基础设施。
- 知识库解析只经过统一 Parser。首期格式为 PDF、DOCX、TXT、Markdown。
- 项目成员首期只有 OWNER 和 MEMBER。不要实现 RBAC。

## 修改前

必须先完成：

1. 阅读 `ARCHITECTURE.md`。
2. 阅读相关模块的现有代码。
3. 搜索已有实现。
4. 理清当前调用链。
5. 检查已有 Service、Repository、Gateway、Schema、异常和测试。
6. 确认依赖方向和 `project_id` 隔离。

然后再改代码。

## 实现约束

- 业务写入先落到 PostgreSQL。
- 需要被搜索的数据通过同一事务中的 Outbox 异步进入 Elasticsearch。
- Router 只做 HTTP。领域规则不 import 框架和供应商 SDK。
- LangChain 只放在文本 AI 适配器。视频生成走 Model Gateway。
- Worker 调用 Application Service，不复制状态机。
- 长任务使用 `queued`、`running`、`succeeded`、`failed`、`canceled`。只有视频任务可以使用 `submitting` 和 `cancel_requested`。
- 新的持久化变更必须带 Alembic 迁移。API 变化必须同步 OpenAPI 类型。
- 行为变化必须补对应测试。未运行的检查不能写成通过。
- 优先修改现有代码。其次扩展现有抽象。最后才新增抽象。
- 新增依赖前必须说明标准库和现有依赖为什么不够。

## 禁止

- 私自更换技术栈或系统边界。
- 绕过模块边界，直接读写其他模块的表。
- Router 直接访问数据库、Elasticsearch 或供应商 SDK。
- 把 Elasticsearch、Redis 或 Celery result 当作事实源。
- 新建一套平行的 Service、Repository、utils 或状态枚举。
- 无理由增加依赖。
- 静默修改数据库结构、公开 API 或任务状态机。
- 删除不了解用途的代码。
- 用 `except Exception: pass` 吞掉错误。
- 为了完成当前功能破坏项目隔离。
- 引入未要求的支付、多智能体、微服务或第二套基础设施。
- 用假数据掩盖未实现的功能。替身必须标明，且不得进入生产配置。

## 架构变更

如果需求与 `ARCHITECTURE.md` 冲突：

1. 停止架构相关修改。
2. 说明冲突。
3. 提交架构变更建议。
4. 草拟 ADR，状态写 Proposed。
5. 等待确认。
6. 确认后先改 ADR 和 `ARCHITECTURE.md`。
7. 然后再改代码。

禁止擅自先改架构文档再以此为理由继续开发。用户已明确授权架构/文档修改时，记录 ADR 并在授权范围内完成，不重复要求同一确认；只授权文档时不擅自实现业务代码。

以下变化必须有 ADR：数据库职责、Elasticsearch、同步机制、队列、Worker、缓存、对象存储、认证、计费、Model Gateway、LangChain 边界、任务状态机、模块边界、主要依赖、服务拆分。

## 完成较大功能后

检查：

1. 是否违反 `ARCHITECTURE.md`。
2. 是否出现重复实现或循环依赖。
3. 是否新增了不必要的依赖。
4. PostgreSQL 是否仍是事实源。
5. Elasticsearch 数据是否仍可重建。
6. 模型调用是否经过 Gateway。
7. 长任务是否异步，状态是否符合统一状态机。
8. 是否存在新的越权、SSRF、密钥泄露或签名 URL 风险。
9. 是否需要新的 ADR。

完成说明必须列出改动、已执行的验证和未解决的限制。

## 契约落实

- 完整状态迁移以 docs/specs/tasks-and-events.md 为准，不从简略箭头图推测。
- 外层 Service 拥有 UoW；跨模块内部调用不得自行提交。
- 幂等唯一键必须包含 idempotency_key 本身。
- 文档是目标规范，当前未实现项见 docs/specs/operations-and-acceptance.md；不能以测试通过声称未实现业务已完成。
- 修改文档后检查相对链接、术语、示例与 ADR 一致性，避免重复维护第二套规则。
