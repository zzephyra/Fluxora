# ADR-020: 文生视频接入

## Status

Accepted — 2026-09-27。用户要求实现文生视频流程。

## Context

[ADR-019](019-business-model-assignment.md) 规定视频指定只保存、不打开供应商调用。[ADR-009](009-task-state-machine.md) 和 [ADR-011](011-video-status-sync.md) 已经规定视频任务使用 submitting、轮询和对象存储，而不是在 HTTP 请求里等待成片。

现有 `generation_tasks` 同时被图片生成使用。图片进程如果领取全部 queued 记录，会把视频任务当成图片执行。

## Decision

- 仅 `text_to_video` 打开调用。`image_to_video`、语音和向量仍只保存指定。
- 同一张 `generation_tasks` 增加 `kind`（image 或 video）。图片进程只领取 `kind=image`。文生视频由独立进程领取 `kind=video`。
- 成员提交 `kind=video`，不能提交 `model_config_id` 或参考图。服务端解析 text_to_video 的当前指定。请求先写入 queued 并返回 202，供应商调用发生在事务外。
- 领取时把 queued 改为 submitting，再提交一次。得到 `provider_task_id` 后改为 running，并写入 `next_poll_at`。轮询不在进程里长睡。
- 提交超时或结果不明时保持 submitting，`reconciliation_required=true`，不得再次提交。
- 供应商明确拒绝才记 failed。轮询超时或暂时错误只推迟下一次轮询。只有视频字节写入对象存储并提交 Asset（kind=VIDEO）和 GenerationOutput 后，才记 succeeded。
- 进度保持空，除非供应商返回真实百分比。不伪造视频文件。
- queued 可以取消。已经进入 submitting 或 running 时，因供应商取消接口未接入，返回 409，状态保持不变。

## Alternatives

- 新建一张视频任务表。图片和视频会各有一套幂等键和查询接口。
- 在 HTTP 请求里等待视频完成。请求会被长任务占住，也和现有状态机冲突。
- 提交超时后自动重发。远端可能已经接受，重发会造成重复生成。

## Consequences

ADR-019 里“视频指定不调用供应商”改为只约束 image_to_video。文生视频使用 DashScope 异步视频接口，密钥仍只出现在服务端请求头。图片生成的状态路径不变。
