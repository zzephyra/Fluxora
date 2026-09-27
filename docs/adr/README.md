# Architecture Decision Records

已确认的决策。变更这些决定时先新增 ADR，再改 `ARCHITECTURE.md`。

| ADR | 标题 | 状态 |
| --- | --- | --- |
| [001](001-modular-monolith.md) | 模块化单体与模块边界 | Accepted |
| [002](002-postgresql-source-of-truth.md) | PostgreSQL 为唯一业务事实源 | Accepted |
| [003](003-elasticsearch-search-index.md) | Elasticsearch 只做可重建检索索引 | Accepted |
| [004](004-pg-es-transactional-outbox.md) | PostgreSQL 到 Elasticsearch 的事务性 Outbox | Accepted |
| [005](005-celery-redis-workers.md) | Celery、Redis 与 Worker | Accepted |
| [006](006-s3-object-storage.md) | S3 兼容对象存储 | Accepted |
| [007](007-cookie-session-auth.md) | Cookie 会话认证 | Accepted |
| [008](008-model-gateway-langchain-boundary.md) | Model Gateway 与 LangChain 边界 | Accepted |
| [009](009-task-state-machine.md) | 统一任务状态机 | Accepted |
| [010](010-billing-deferred.md) | 首期不做计费账本 | Accepted |
| [011](011-video-status-sync.md) | 视频状态同步 | Accepted |
| [012](012-document-parser.md) | 知识库文档解析 | Accepted |
| [013](013-project-membership-roles.md) | 项目成员角色 | Accepted |
| [014](014-executable-contracts.md) | 可执行契约与恢复边界 | Accepted |
