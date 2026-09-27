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

视频生成额外使用：

```text
queued → submitting → running → succeeded | failed
queued → canceled
running → cancel_requested → canceled | succeeded
```

`submitting` 表示正在向供应商提交。`cancel_requested` 表示已请求取消但供应商尚未确认。竞态中已完成的任务可以从 `cancel_requested` 进入 `succeeded`。终态不得回到非终态。

状态迁移只通过对应 Application Service，并用版本条件更新。用户再次提交失败任务时创建新任务。一次提交内部的瞬时重试写入 `generation_attempts`，不把原任务从 `failed` 改回 `running`。

对话运行使用同一组基础状态，不使用 `submitting`。每个会话同时最多一个活跃 run。文档解析成功和索引成功分开记录，不合并成一个状态。

幂等键范围为 `project_id + actor_id + operation`，并校验请求哈希。相同键、不同请求返回 409。

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
