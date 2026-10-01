# ADR-023: 用户素材直传七牛云

## Status

Accepted — 2026-09-28。用户要求接入七牛云 Kodo，并由浏览器直接上传图片和视频。

## Context

[ADR-006](006-s3-object-storage.md) 规定生成结果进入私有的 S3 兼容对象存储。用户素材如果先经过 FastAPI，再由服务器转发到对象存储，大视频会占满 API 进程。

## Decision

- 用户选择的图片、视频和普通文件由浏览器直传七牛。FastAPI 只做登录校验、文件校验、生成对象 key、签发上传凭证，并在上传完成后核对七牛上的对象。
- 对象 key 只能由服务端生成，格式为 `uploads/{category}/{user_id}/{yyyy}/{mm}/{uuid}.{ext}`。user_id 来自当前会话。
- 上传凭证限定 bucket、key、MIME、大小和有效期，并禁止覆盖已有对象。Secret Key 和完整 token 不写入日志，Secret Key 不返回给浏览器。
- 上传记录写入 PostgreSQL `upload_files`。complete 在七牛确认对象存在且大小、MIME 符合登记后，才把状态改为 uploaded。删除按文件 ID 和当前用户授权，先删七牛对象，再标记 deleted。
- 服务端生成的文件可以通过 Storage Service 写入七牛。图片生成和文生视频已经写入 ADR-006 的私有存储，这次不改那条写入路径。
- 业务代码不直接调用七牛 SDK。

## Consequences

用户素材和已生成的图片、视频暂时分属两套对象存储。全部作品汇总仍未实现。七牛配置只来自环境变量。
