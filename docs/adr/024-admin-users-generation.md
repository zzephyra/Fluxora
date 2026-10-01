# ADR-024: 用户管理与生成任务运营后台

## Status

Accepted — 2026-09-28。用户明确确认按本方案扩展管理员权限并实现。

## Context

ARCHITECTURE.md §20 与 ADR-018 将 platform_admin 限定为模型目录和业务指定，不允许跨项目内容访问。实际用户管理和全平台任务查询超出此边界。复用项目成员接口或只在前端隐藏按钮都不能实现合法的运营权限。

现有 auth 模块已保存 active/disabled 用户状态、会话撤销时间；generation 模块已保存图片/视频任务、状态、供应商、时间及取消逻辑，可以复用，不需要新建任务状态机或 RBAC。

## Decision

### 权限范围

- 保留 platform_admin，作为独立后台接口的授权条件。每次请求重新查询 PostgreSQL 中的账号状态及管理员标记，非管理员返回 404。写操作沿用 Origin、CSRF 检查。
- 增加全平台用户基础信息管理与生成任务运营元数据访问权限；不授予项目成员身份，不改变现有项目 API 鉴权。
- 不允许后台查看对话、知识库、记忆、原始提示词、参考素材、输出文件内容或下载链接。任务查询不返回 request_snapshot、密钥引用、供应商原始响应、会话令牌或哈希。
- 管理员标记继续只能通过受控命令授予或撤销。首版不支持在后台创建用户、修改邮箱、重置密码、物理删除账号或任务。

### 用户管理 /admin/users

- 服务端分页，按邮箱搜索、active/disabled 状态筛选；展示用户 ID、邮箱、状态、平台管理员标记、创建时间。
- 支持停用/恢复普通用户、撤销普通用户的全部现有会话。禁止在此处操作自己或任何平台管理员账号，避免锁死管理入口。
- 停用与撤销现有会话在同一 PG 事务完成，恢复不会复活旧会话。已提交的生成任务仍按现有恢复机制收尾，停用不意味着任务已经取消。
- 修改使用 expected_updated_at 并锁定目标行；并发冲突返回 409，重新读取后再决定，不能静默覆盖。
- 用户写操作与审计记录同事务提交，记录操作者、目标、动作、前后状态、时间和 request_id，不记录密码、会话信息或完整请求。

### 生成任务 /admin/tasks

- 全平台图片/视频任务服务端分页；按类型、状态、供应商、项目 ID、发起人 ID、任务 ID、创建时间及是否需要核对筛选。排序稳定为 created_at、id 倒序。
- 展示任务 ID、project_id、actor_id、类型、模型配置 ID/版本、供应商、真实 status/phase/progress、创建/开始/结束时间及 reconciliation_required。
- 错误使用白名单错误码和安全说明；不得直接返回未审查的供应商 error_message。
- 允许管理员请求取消符合现有规则的任务；前端先确认并展示服务端 allowed_actions。图片仅 queued 可取消，视频沿用现有取消流程与供应商能力检查。
- 任务详情和取消均使用 project_id + task_id 定位。跨项目元数据列表通过专用管理查询完成，不给普通项目 Repository 添加无鉴权的全局入口。
- 取消状态变更与管理审计同事务提交。供应商取消在既有 Worker 流程完成，不在管理 HTTP 请求内发起供应商调用；cancel_requested 不展示为 canceled。
- 不提供重试生成、强制成功/失败、删除任务或人工修改进度；结果不明的任务保持待核对，不重复付费提交。

### 实现与接口

- 用户用例归 auth 模块，任务用例归 generation 模块；Router 只处理 HTTP、DTO 和鉴权。跨模块数据通过现有 Service 获取，不直接访问别的模块表。
- 预计新增 GET /api/v1/admin/users、PATCH /api/v1/admin/users/{user_id}/status、POST /api/v1/admin/users/{user_id}/revoke-sessions。
- 预计新增 GET /api/v1/admin/generation-tasks、GET /api/v1/admin/projects/{project_id}/generation-tasks/{task_id}、POST 同路径 /cancel。
- 所有列表有分页上限；缓存 no-store。前端查询按后台资源、身份和筛选条件隔离；退出清理缓存，轮询仅在页面可见时运行。
- 审计表通过 Alembic 迁移增加，归操作所属模块管理；不改写模型审计记录的含义。OpenAPI 与生成 TypeScript 类型同步更新。
- 不新增运行时依赖，不改变 PostgreSQL/ES 职责，不引入 RBAC、支付或新队列。

## Acceptance

- 普通用户、未登录用户不能读取或修改管理数据；项目 API 仍保持成员隔离。
- 覆盖 CSRF、管理员被撤权、不能操作自己/管理员、停用后会话失效、恢复后旧会话仍失效、并发冲突和审计回滚。
- 任务覆盖筛选分页、真实终态、取消竞态、供应商不支持取消、待核对任务不重发、敏感字段不外泄。
- UI 覆盖加载、空结果、错误重试、分页、详情、操作确认、提交中禁用、失败提示、数据刷新及移动端。

## Consequences

用户确认后已更新 ARCHITECTURE.md §9/§20 和对应规范，并实现独立后台 API、用户页、任务页及事务审计。当前图片和视频适配器都仅支持 queued 取消；运行中取消继续返回 409，不新增供应商取消能力。
