# ADR-011: 视频状态同步

## Status

Accepted

## Context

不同视频供应商用轮询或回调报告进度。如果 Generation Service 自己分支处理 Polling 和 Webhook，每接入一个供应商都会改动任务核心。首期又没有必须公网接收回调的供应商。

## Decision

Generation Service 只接收 Provider 给出的远程观察结果，不依赖状态是怎么取得的。

每个视频 Provider 声明自己的同步方式。首期默认是 Polling：Worker 调用 Provider 的状态查询。Provider 端口同时允许声明 Webhook，以便以后单个供应商切换，而不改任务状态机。

首期不建设 Webhook 的公网入口、验签中间件或独立回调队列。接入真正的 Webhook 时，该 Provider 必须先验签、限制时效并去重，再转换成同一种远程观察结果。

## Alternatives

- 一开始就做通用 Webhook 网关。
- 在 Generation Service 中分别写轮询循环和回调处理器。
- 只支持 Polling，以后用 Webhook 时重写任务模块。

## Trade-offs

端口里保留同步方式，比现在就部署回调基础设施多一点接口，但避免了用不到的公网攻击面。把两种方式写进业务服务会让任务状态和供应商协议缠在一起。

## Consequences

Worker 根据 Provider 声明决定是否轮询。Webhook 供应商以后只新增适配器和受控入口。任务的 `queued`、`submitting`、`running` 和终态仍然只由 Generation Service 迁移。

## Migration

项目尚未实现业务生成流程，无迁移。
