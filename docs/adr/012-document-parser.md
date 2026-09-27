# ADR-012: 知识库文档解析

## Status

Accepted

## Context

知识库要接受多种文件，并在解析后进入同一条索引链路。如果业务代码按扩展名选择解析器，每增加一种格式都会修改上传、分块和检索流程。

## Decision

文档解析使用统一 Parser。业务代码只处理格式标识和解析结果，不判断具体文件格式。

首期需要实现的格式：PDF、DOCX、TXT、Markdown。XLSX、CSV、PPTX、HTML 和网页只通过新增 Parser 扩展，首期不实现。

格式识别集中在一个解析入口。后续格式不得在 Service 中增加文件类型分支。

统一链路：

```text
Upload → Parse → Normalize → Chunk → Embedding → Index → Retrieval
```

解析产物是可重建的文本和定位信息。原文仍以对象存储和 PostgreSQL 记录为准。

## Alternatives

- 在上传 Service 中按 MIME 类型调用不同库。
- 首期同时实现表格、演示文稿和网页抓取。
- 为每种格式建立独立的入库流水线。

## Trade-offs

统一 Parser 需要一个注册入口。它比在业务里直接调用 PDF 库多一层，但格式扩展不会碰到检索和权限。首期不做表格和网页，避免引入抓取、脚本执行和复杂版式问题。

## Consequences

未注册的格式在入口处拒绝，而不是进入分块。更换解析器不得改变 PostgreSQL 是事实源、Elasticsearch 是索引的规则。

## Migration

解析器实现尚未开始，无迁移。
