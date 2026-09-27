# ADR-003: Elasticsearch 只做可重建检索索引

## Status

Accepted

## Context

知识库需要全文、过滤、聚合和向量混合召回。检索数据必须能在索引损坏后重建，并且不能成为权限或任务状态的判断依据。

## Decision

Elasticsearch 是派生搜索索引，不是事实源。PostgreSQL 与 Elasticsearch 冲突时以 PostgreSQL 为准。

首期索引：

- `knowledge_vN`，读别名 `knowledge_read`：分块文本与 embedding。
- `memory_vN`，读别名 `memory_read`：记忆候选。

不把生成任务、权限、会话真值或文件字节放入 Elasticsearch。不引入第二套向量数据库。Embedding 维度、分块规则和 mapping 必须版本化，换模型时重建索引，禁止混用不同向量空间。

查询路径：服务端强制 `project_id` 过滤，取出命中 ID，再回查 PostgreSQL 的版本、删除状态和权限。不得把 Elasticsearch 中的正文直接返回给用户或模型。

索引全部删除后，必须能只靠 PostgreSQL 中的分块、记忆和对象存储中的原始文件重建。

## Alternatives

- 另建 Milvus、pgvector 或 Chroma 保存向量。
- 用 Elasticsearch 保存任务状态和用户权限。
- 只在 PostgreSQL 做全文检索。

## Trade-offs

Elasticsearch 同时承担文本和向量会让 mapping 变更更贵，所以索引版本和 alias 从第一天启用。pgvector 少一个组件，但会把混合检索和聚合做进事务库，和“搜索可独立重建”的目标冲突。第二套向量库会制造无法从 PostgreSQL 解释的派生副本。

PostgreSQL 全文检索对项目级 RAG 的模糊搜索和向量召回不够用。

## Consequences

搜索结果是最终一致的。聚合不得用于计费或授权。Elasticsearch 故障时，任务和普通业务查询继续走 PostgreSQL；知识检索返回明确的暂不可用。

## Migration

项目尚未实现，无迁移。
