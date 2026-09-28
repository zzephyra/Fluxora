# ADR-019: 业务模型指定

## Status

Accepted — 2026-09-27。用户要求实现该流程。

## Context

[ADR-018](018-model-admin-control.md) 已经让平台管理员按能力登记和停用模型。项目成员可以读取已启用目录。文本补全和图片生成仍由客户端提交 `model_config_id`，因此成员可以在已启用模型里改选。

产品要求是另一层：管理员把模型按能力分类；每项业务单独指定一个模型，候选只来自该类已启用配置；前端不能选择模型，指定是全局的，不是项目级的。

## Decision

- 目录仍是登记处。capability 增加 `speech_synthesis` 和 `speech_recognition`，只用于分类。视频仍分成 `text_to_video` 和 `image_to_video`。
- `model_assignments` 每个 capability 最多一行，指向一个已启用且能力相同的 `model_configs`。只有平台管理员可以读取、替换和清除。项目 OWNER 不能。非管理员访问管理接口返回 404。
- 停用当前被指定的配置时，同一事务清除该指定，并写入 `unassigned` 审计。替换指定时，旧配置记 `unassigned`，新配置记 `assigned`。审计不记录密钥。
- 成员通过 `GET /api/v1/projects/{project_id}/active-model?capability=` 读取当前指定。未指定返回 404。`GET /projects/{project_id}/models` 仍只返回已启用目录，产品页面不用它做选择。
- `POST` 文本补全和图片生成不再接受 `model_config_id`。服务端解析对应能力的指定，并把 `model_config_id` 与 `config_version` 快照写入任务。未指定返回 422。之后更换指定不改变已排队任务。
- 前端在提交前只读展示当前模型名称。没有指定时，对应提交保持关闭。
- 视频、语音和向量即使被指定，也不打开供应商调用。更换向量指定不触发索引重建。

## Alternatives

- 让该类全部已启用模型都可调用。成员仍能改选，也和“一项业务一个模型”不一致。
- 只隐藏下拉框，接口仍接受客户端传入的模型 ID。
- 让项目 OWNER 为每个项目指定模型。指定会变成项目资源，而不是全局业务配置。

## Consequences

文本和图片调用改为使用全局指定。语音、向量和 image_to_video 指定只保存，不发起供应商调用。[ADR-020](020-text-to-video.md) 允许已指定的 text_to_video 进入现有视频状态机。更换向量模型后的索引重建仍按总架构单独执行。
