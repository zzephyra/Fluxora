# ADR-001: 模块化单体与模块边界

## Status

Accepted

## Context

Fluxora 首期需要 API、对话、知识库、记忆、视频生成和资源管理。这些能力共享项目隔离和用户权限。过早拆成微服务会带来分布式事务、重复鉴权和部署成本，而当前没有独立扩缩容的证据。

## Decision

采用模块化单体。API 与 Worker 分进程部署，共用同一套 Application Service 和 Domain 规则。

业务按模块划分：`auth`、`projects`、`chat`、`knowledge`、`memory`、`generation`、`assets`。搜索、对象存储、模型访问和 Outbox 是基础设施，不是业务模块。

模块之间只通过对方的 Application Service 或显式 Port 通信。禁止跨模块访问 Router、Repository 和数据表。

模块内部先使用扁平文件：`router.py`、`schemas.py`、`service.py`、`domain.py`、`repository.py`、`models.py`。只有模块变大时才拆成 package。`domain.py` 保持纯净；`models.py` 只表示 SQLAlchemy 持久化。

依赖方向：

```text
auth
projects    → auth
knowledge   → projects, assets
memory      → projects
chat        → projects, knowledge, memory
generation  → projects, assets
assets      → projects
```

基础设施适配器不得反向调用业务 Service 来决定状态。

## Alternatives

- 按 controllers / services / repositories 横切整个后端。
- 一开始为每个模块建立 domain / application / infrastructure / api 四层目录。
- 按生成、检索、对话拆成多个服务。

## Trade-offs

横切目录会让项目隔离规则散落在各层。四层空目录会在没有代码时制造假边界。微服务可以独立部署，但首期会把权限、Outbox 和任务状态拆到多个事实源附近。

扁平模块会在单个文件变长后需要再拆。这是可逆的，拆服务不是。

## Consequences

新增业务必须落进已有模块，或先用 ADR 说明为什么现有模块无法容纳。不允许出现跨模块的数据库外键捷径来代替 Service 调用；同一数据库内的外键可以表达归属，但查询仍必须从拥有该表的 Repository 发起。

## Migration

项目尚未实现，无迁移。
