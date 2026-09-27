# ADR-002: PostgreSQL 为唯一业务事实源

## Status

Accepted

## Context

系统同时需要事务、权限判断、任务状态和可重建的搜索索引。如果业务真值分散在搜索引擎、缓存或对象存储，冲突时无法判断哪一份为准。

## Decision

PostgreSQL 是唯一核心业务事实源。用户、会话、项目、成员、对话、消息、文档、分块、记忆、生成任务、资源元数据、模型配置和 Outbox 都先写入 PostgreSQL。

权限、任务状态、资源归属、配额和未来的余额、订单、支付只查询 PostgreSQL。

数据访问使用 SQLAlchemy 2 async 与 asyncpg。迁移只使用 Alembic。Session 由请求或 Worker 的 Unit of Work 统一打开和提交。Service 划定事务边界，Repository 不自行 commit。

主键使用 UUID。时间使用 UTC。项目资源表必须有非空 `project_id`，并用外键和复合约束避免跨项目关联。项目资源 Repository 必须接收 `project_id`。

生产环境禁止 `create_all`。禁止业务代码直接 `os.getenv` 或自行创建 Session。

## Alternatives

- SQLModel 或 Tortoise 作为 ORM。
- 把任务状态或文档正文只放在 Elasticsearch、Redis 或对象存储。
- 同步 SQLAlchemy。

## Trade-offs

SQLAlchemy 映射代码比 SQLModel 多，但 DTO、领域规则和 ORM 不会混成一个类型。异步驱动不能调用阻塞数据库操作。同步 ORM 会阻塞 FastAPI 事件循环，只适合放在独立的同步 Worker 路径中；本项目统一走异步 Session。

## Consequences

所有业务 Create、Update、Delete 首先作用于 PostgreSQL。缓存、索引和队列丢失后，必须能从 PostgreSQL 恢复业务状态。软删除或项目关闭也先落在 PostgreSQL，再异步清理派生数据。

## Migration

项目尚未实现，无迁移。

执行级表结构与跨模块 UoW 规则见 [数据与事务](../specs/data-and-transactions.md)。
