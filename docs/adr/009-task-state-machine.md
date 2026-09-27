# ADR-009: 统一任务状态机

## Status

Accepted

## Context

对话运行、文档入库和视频生成都是长时间工作。如果各模块自定 `processing`、`doing`、`finished`，恢复、取消和前端展示会无法共用。

## Decision

对外统一使用：

```text
queued → running → succeeded | failed | canceled
```

视频生成额外使用 submitting 和 cancel_requested。完整允许转移以 [任务与同步](../specs/tasks-and-events.md) 为准；ADR-014 补全提交失败、提交期间取消、取消期间失败和未决结果处理。不新增公开状态，未决结果通过 reconciliation_required 标记。

状态只通过 Application Service 按版本条件更新。终态不可回退；用户重试创建新任务，内部重试记 attempt。每个会话最多一个 queued/running chat_run，文档入库和索引分阶段记录。

幂等唯一约束为 (project_id, actor_id, operation, idempotency_key)，请求哈希不同返回 409；仅前三项相同不应阻止新的请求。事务规则见 [数据与事务](../specs/data-and-transactions.md)。

## Alternatives

- 每个模块维护自己的状态枚举。
- 增加独立的 `PENDING`，与 `queued` 同时暴露给 API。
- 用 Celery 状态代替 PostgreSQL 状态。

## Trade-offs

视频状态比基础集合多两个值，前端必须理解取消尚未确认。若强行收成六个完全相同的状态，就会把“正在提交”和“供应商已在跑”混在一起，无法处理结果不明的超时。

数据库可以在事务提交前存在未公开的行，但 API 不暴露另一套 pending 词汇。提交成功后的首个公开状态是 `queued`。

## Consequences

新的长任务必须映射到这组词汇。需要新状态时先写 ADR。取消接口不能把 `cancel_requested` 显示成 `canceled`。

## Migration

项目尚未实现，无迁移。
