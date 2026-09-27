# ADR-006: S3 兼容对象存储

## Status

Accepted

## Context

上传资料和生成的视频不能放进 PostgreSQL。本地磁盘也无法提供私有访问和可更换的生产环境。

## Decision

二进制内容放入 S3 兼容对象存储。开发环境使用 MinIO，生产使用 S3、R2 或其他 S3 兼容服务。

PostgreSQL 的 `assets` 表保存归属、`object_key`、校验和、MIME、大小、宽高、时长、状态和来源。图片、视频、音频和普通文件共用 Asset，不各自设计文件系统。

桶默认私有。签名 URL 仅在项目授权后短期签发。客户端使用 boto3，在异步调用路径中通过线程池执行。

对象删除发生在 PostgreSQL 已标记资源不可访问之后。

## Alternatives

- 云厂商专有 SDK。
- 把文件路径只存在应用服务器磁盘。
- 把媒体字节存入 PostgreSQL large object。

## Trade-offs

boto3 是同步客户端，异步 API 需要线程池。专有 SDK 能少包一层兼容差异，但会把开发环境和生产环境拆开。磁盘存储没有签名 URL 和跨机器恢复。数据库存字节会破坏备份和查询。

## Consequences

资源是否存在、属于哪个项目，以 PostgreSQL 为准。对象存储里的孤儿文件可以由对账清理；只有对象、没有 PostgreSQL 记录的文件不得返回给用户。

## Migration

项目尚未实现，无迁移。
