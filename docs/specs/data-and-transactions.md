# 数据模型、事务与并发

## 1. 通用约定

业务表使用 UUID 主键、timestamptz 的 created_at/updated_at；可变聚合增加 bigint version（从 1 开始）。项目资源具有非空 project_id。用户、认证会话、系统模型配置和索引维护记录是全局例外。索引维护事件使用单独的系统任务上下文，禁止用伪造 project_id 通过项目授权。

表中的业务枚举使用文本列加 CHECK 约束；枚举值与 API 一致。关系、权限、状态与查询字段必须为显式列；jsonb 只保存参数快照、能力描述和事件载荷，不能代替关系模型。外键默认 RESTRICT，物理清理由拥有模块的清理用例按依赖顺序执行。

所有跨项目资源引用使用 (project_id, resource_id) 复合外键，目标表提供对应 UNIQUE。项目资源查询必须带 project_id；数据库约束兜底，不能代替 Service 授权。首期不依赖 RLS 实现权限；增加 RLS 需要 ADR。

## 2. 表归属与必需字段

除通用字段外，下表字段是最低业务要求。`?` 表示可空；实现迁移时不得自行删去约束。

| 所属模块 / 表 | 必需字段与约束 |
| --- | --- |
| auth.users | email_normalized UNIQUE、password_hash、status(active/disabled)；不存明文密码 |
| auth.sessions | user_id、token_hash UNIQUE、csrf_token_hash、expires_at、revoked_at?；会话令牌只存哈希 |
| projects.projects | name、created_by、deleted_at?、version |
| projects.project_members | project_id、user_id、role(OWNER/MEMBER)；UNIQUE(project_id,user_id)，每项目恰有一个 OWNER，由事务维护；部分唯一索引确保至多一个 |
| chat.conversations | project_id、title、created_by、deleted_at? |
| chat.messages | project_id、conversation_id、sequence、role(user/assistant)、content、run_id?、completion_status(complete/partial)、deleted_at?；UNIQUE(conversation_id,sequence) |
| chat.chat_runs | project_id、conversation_id、user_message_id、assistant_message_id?、status、actor_id、model_config_id、model_config_version、request_snapshot、context_manifest、error?、lease字段、started_at?、finished_at?；每会话 queued/running 的部分唯一约束 |
| chat.message_citations | project_id、message_id、ordinal、document_id、document_version_id、chunk_id、locator、source_hash；UNIQUE(message_id,ordinal)，删除源后不返回正文 |
| chat.conversation_summaries | project_id、conversation_id、through_sequence、content、template_version、model_version；摘要是可丢弃派生内容，原始消息仍在 PG |
| knowledge.documents | project_id、title、current_version_id?、created_by、deleted_at? |
| knowledge.document_versions | project_id、document_id、version_number、asset_id、content_hash、parser_version、chunker_version、ingestion_status、index_status、index_revision、error?；UNIQUE(document_id,version_number) |
| knowledge.chunks | project_id、document_version_id、ordinal、text、token_count、locator、content_hash；UNIQUE(document_version_id,ordinal)，分块写入完成后不可原地改写 |
| memory.memories | project_id、kind、current_revision_id、created_by、deleted_at?、version |
| memory.memory_revisions | project_id、memory_id、revision_number、content、source_type(manual/message/document)、source_id?、source_version?、confirmed_by、confirmed_at、status(active/superseded/deleted)；UNIQUE(memory_id,revision_number)，每记忆最多一个 active |
| generation.generation_tasks | project_id、actor_id、status、model_config_id、model_config_version、request_snapshot、retry_of_task_id?、provider_task_id?、provider、reconciliation_required、phase、progress?、next_poll_at?、error?、lease字段、started_at?、finished_at? |
| generation.generation_attempts | project_id、task_id、attempt_number、operation(submit/poll/cancel/store)、provider_request_key、outcome、error_type?、usage?、started_at、finished_at?；UNIQUE(task_id,attempt_number) |
| assets.assets | project_id、kind(IMAGE/VIDEO/AUDIO/FILE)、object_key UNIQUE、sha256?、mime、size_bytes?、width?、height?、duration_ms?、status(uploading/ready/failed/deleted)、created_by、upload_expires_at?、deleted_at? |
| generation.generation_outputs | project_id、task_id、asset_id、ordinal；UNIQUE(task_id,ordinal)，成功任务至少有一个 ready 输出 |
| infrastructure.ai.model_configs | provider、model_name、capability、config_version、parameters_schema、limits、secret_ref、enabled；UNIQUE(provider,model_name,capability,config_version)，版本不可改写，只能停用 |
| infrastructure.outbox.outbox_events | event_id、project_id?、aggregate_type、aggregate_id、aggregate_version、event_type、schema_version、payload、created_at；事件事实不可变 |
| infrastructure.outbox.event_deliveries | event_id、consumer、target_generation、status、attempt_count、next_attempt_at、lease字段、last_error?、completed_at?；UNIQUE(event_id,consumer,target_generation) |
| infrastructure.db.request_idempotency | project_id、actor_id、operation、idempotency_key、request_hash、resource_id、response_status、created_at；四字段 UNIQUE(project_id,actor_id,operation,idempotency_key) |
| infrastructure.search.index_builds | logical_index、target_index、state、snapshot_cursor、started_at、validated_at?、cutover_at?、error?；维护重建进度 |

model_configs 由 AI Gateway 的配置 Repository 拥有，业务 Service 通过能力 Port 查询，不引入独立模型业务模块。记忆来源为多态引用：通过来源模块验证归属和存在性，不能声称普通外键已校验多态 source_id。手工创建可以没有来源；从消息/文档创建必须有来源版本。

按实际查询添加组合索引，至少覆盖 (project_id,created_at,id)、各父资源 ID、任务(status,next_poll_at)、delivery(status,next_attempt_at)。禁止无限制的全表业务列表。对象 key 采用 projects/{project_id}/assets/{asset_id}/{opaque_name}，不暴露用户文件名或跨项目复用 key。

## 3. UoW 与跨模块事务

最外层 Application Service 是一次用例的唯一事务所有者。Router/Worker 负责注入 UoW 工厂，不负责 commit。内部模块公开方法显式接收同一个 UoW，只 flush，不 commit、不重新创建 Session；外层失败则一起 rollback。禁止 Session 在并发 coroutine 间共享。

示例：生成结果字节写入对象存储并验证 → Generation Service 开启 UoW → Assets Service.register_ready(uow, ...) → 写 generation_outputs → 任务变 succeeded → 写 Outbox → 外层 commit。任一步失败，所有 PG 写入一起回滚；孤儿对象由对账处理。

网络操作不占用数据库事务：短事务读取并冻结输入/领取租约 → 关闭事务 → 外部调用 → 新短事务验证租约令牌和版本、落结果。不得为了保持同一 UoW 跨越下载、模型调用或 SSE。

并发更新使用 WHERE version = expected_version 并递增版本；影响零行返回冲突或由后台重新读取。成员删除、项目删除与新外部提交共享项目授权检查的锁定协议：在短事务中检查并记录执行授权，提交前再确认；已经发出的网络请求不能承诺撤回，后续仅允许恢复查询、取消和清理。

## 4. 幂等、重试与编辑冲突

生成、聊天消息、上传初始化、文档创建/版本提交使用 Idempotency-Key（1–128 个 ASCII 可打印字符）。唯一约束包含键本身，不能只约束项目/用户/操作。operation 使用稳定语义名，例如 generation.create，资源 ID 是请求哈希的一部分。

哈希覆盖规范化后的业务 DTO、路径资源、选定模型版本；排除 request_id、Cookie、时间与幂等键。首次创建资源、幂等记录和 Outbox 在同一事务提交。并发相同键由唯一约束收敛，重新读取原结果；相同请求返回原状态码/资源 ID，不再提交新任务；不同请求返回 409 idempotency_conflict。重放仍需当前授权，不得复活已删除项目。关联资源已删除时返回 410 resource_gone。

记录在资源保留期内不得清除；物理清理后保留键与哈希墓碑 30 天，并明确幂等重放保证只在该保留窗口内成立。用户主动重试使用新键，并关联 retry_of_task_id。

PATCH 项目、会话、记忆必须携带 expected_version，失配返回 409 version_conflict。任务取消是幂等命令，不要求客户端根据旧状态计算转移。不要用“先查询再插入”代替唯一约束。

## 5. 来源验证与清理

memory 使用 VerifiedSourcePort 验证来源。该 Port 由来源拥有模块提供只读实现，仅返回已授权的来源 ID、项目、版本与哈希；在组合入口注入，memory 不 import chat/knowledge Service，不产生 chat → memory → chat 的递归用例。来源拥有模块的 Repository 仍是唯一查询者。系统模型配置通过只读 capability Port 注入，不引入反向业务依赖。

删除先屏蔽读取；正文/对象物理清理与引用元数据保留分开。被 message_citations 引用的 chunk/document 不能直接删掉导致外键失败：清空可删除正文并保留 ID、hash、locator、deleted_at 墓碑，待引用的保留期结束后按依赖顺序清理。chunks.text 在有效期间非空，清理后允许 NULL，查询必须排除墓碑。记忆修订亦只保留必要元数据，不用修订历史绕过用户删除。

旧版文档更新不会物理清理尚需历史引用的正文；文档显式删除才触发清理。项目删除清理涉及多个模块，由恢复 Worker 调用各模块公开清理用例，业务模块之间不反向 import。全局审计记录由 infrastructure 提供追加写入 Port，至少记录 actor、operation、target、request_id、outcome、created_at，不保存密钥或原文。任务人工恢复必须写审计记录。
