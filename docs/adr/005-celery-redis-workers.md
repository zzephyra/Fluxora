# ADR-005: Celery、Redis 与 Worker

## Status

Accepted

## Context

视频生成、文档解析、Embedding、索引和重建都不能占用 HTTP 请求。任务真值必须在进程崩溃或队列丢失后仍可恢复。

## Decision

长时间工作进入 Celery Worker。Redis 只作为 Celery broker、短期 SSE 缓冲、限流和锁。

任务状态、尝试记录、租约和 Outbox 保存在 PostgreSQL。不使用 Celery result backend 作为业务结果。API 与 Worker 分进程，Worker 调用 Application Service，不复制一套状态迁移。

领取任务使用租约和心跳。超时后由恢复任务接管。供应商调用结果不明时先查询，禁止直接再次提交。

Redis 数据允许丢失。丢失后从 PostgreSQL 恢复任务和事件，不从 Redis 恢复业务事实。

## Alternatives

- ARQ。
- Dramatiq。
- 只用 PostgreSQL `FOR UPDATE SKIP LOCKED` 做队列。
- RabbitMQ 作为 broker。
- FastAPI BackgroundTasks。

## Trade-offs

Celery 比 ARQ 重，硬超时在极端情况下也可能来不及执行清理。因此清理和真值更新以 PostgreSQL 租约为准，不依赖子进程的 finally。ARQ 更贴近 asyncio，但长时间外部轮询和运维约定较少。纯 PostgreSQL 队列组件最少，但会把调度、重试和隔离队列提前做成框架。RabbitMQ 作为 broker 更稳，却在 Outbox 已经负责可靠性时增加一套消息系统。

BackgroundTasks 随 API 进程生死，不能用于长任务。

## Consequences

视频、入库、索引、重建各自进入明确队列。Worker 崩溃后任务仍可从 PostgreSQL 查到并恢复。限流计数和 SSE 事件可以过期。

## Migration

项目尚未实现，无迁移。

执行模式、租约 fencing 和投递完成判定见 [任务与同步](../specs/tasks-and-events.md)。
