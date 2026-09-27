# ADR-004: PostgreSQL 到 Elasticsearch 的事务性 Outbox

## Status

Accepted

## Context

业务写入和索引写入不能放在同一个分布式事务里。先写索引或由普通 Service 连续调用两个存储，都会在半成功时留下无法恢复的状态。

## Decision

使用 Transactional Outbox。

```text
Application Service
  → 同一 PostgreSQL 事务：业务记录 + outbox_events
  → commit
  → 返回业务成功
  → Dispatcher → Celery → Index Worker → Elasticsearch
```

Outbox 至少包含 `event_id`、`event_type`、`aggregate_id`、`project_id`、`aggregate_version`、`schema_version`、`payload`、`created_at` 和投递状态。

投递至少一次。消费者按聚合版本幂等。旧事件不得覆盖新文档。删除使用带版本的墓碑。暂时失败指数退避；永久失败记入 PostgreSQL，允许人工重放。

队列丢失时按 event_deliveries 的消费者完成状态恢复，broker 接受不等于消费完成。重建注册双目标投递、构建一致性快照、追平后在短写入屏障内切换 alias；不以自增 ID 最大值代替提交水位。协议见 [任务与同步](../specs/tasks-and-events.md) 与 ADR-014。

普通业务 Service 禁止在保存 PostgreSQL 之后直接调用 Elasticsearch index。

文档处理必须分开记录 `ingestion_status` 与 `index_status`。

## Alternatives

- 业务事务中同步双写 PostgreSQL 和 Elasticsearch。
- 事务提交后在请求线程里直接索引。
- Debezium 或数据库 WAL 订阅。

## Trade-offs

Outbox 需要 Dispatcher、幂等消费者和对账任务。双写实现更短，但失败时无法判断哪边已成功。请求线程索引会把 Elasticsearch 故障变成用户请求失败。WAL 订阅组件更重，首期没有独立数据平台。

一致性是最终一致，不是强一致。

## Consequences

PostgreSQL 提交成功即业务成功，即使索引稍后失败。搜索可能短暂看不到刚写入的数据。对账和重建是索引设计的一部分，不是补救脚本。

## Migration

项目尚未实现，无迁移。
