# API、身份与权限契约

## 1. 传输与错误

业务前缀 /api/v1；下表 P 为 /projects/{project_id}。JSON 字段 snake_case，ID 为 UUID 字符串，时间为 UTC ISO 8601。集合响应为 {items: [], next_cursor: null}，默认 limit=20、最大 100。PG 列表按 (created_at DESC,id DESC) 分页，游标绑定过滤条件；消息按 sequence 正序。游标不是授权凭据。

创建实体 201，异步运行 202，查询/修改 200，删除 204。未认证 401；非成员访问项目/资源统一 404；成员无操作权限 403。请求禁止传入 project_id、actor_id、价格、密钥等服务端归属字段，未知字段返回 422。

错误格式：error 包含 code、message、details（对象），顶层 request_id。错误码固定为 snake_case。最低错误集合：

| HTTP | code | 场景 |
| --- | --- | --- |
| 401 | authentication_error | 会话失效 |
| 403 | authorization_error / csrf_failed | 无权限/CSRF 校验失败 |
| 404 | not_found | 不存在或不可见 |
| 409 | version_conflict / idempotency_conflict / active_run_exists | 并发冲突 |
| 409 | invalid_transition / cancellation_unsupported / resource_in_use | 状态或资源限制 |
| 410 | resource_gone | 授权范围内幂等重放资源已清理 |
| 413 / 415 | file_too_large / unsupported_media_type | 上传限制 |
| 422 | validation_error / domain_error / context_too_large | 非法输入 |
| 429 | rate_limit | 必须附 Retry-After |
| 502 / 503 / 504 | provider_error / retrieval_unavailable / timeout | 依赖故障 |
| 500 | internal_error | 不暴露堆栈与输入敏感值 |

## 2. 身份与权限

首期 email/password 登录，管理员受控命令创建用户；不提供公开注册、邮件找回或 OAuth。密码使用 Argon2id，身份模块实现时登记并锁定依赖，不自行实现密码哈希。登录错误统一响应，避免枚举账号。

GET /auth/csrf 发放短期预认证 CSRF token/cookie；登录和修改请求验证 Origin 与 X-CSRF-Token。登录后轮换会话及 CSRF token。会话令牌使用至少 256 bit 安全随机源，PG 只存哈希。Cookie 名 fluxora_session，HttpOnly、Secure、SameSite=Lax、Path=/，不设置跨站 Domain；绝对有效期默认 7 天，登出立即撤销。

生产前后端独立构建，通过反向代理同源发布；开发 Vite 代理 /api，仅 development localhost 可关闭 Secure。请求统一 credentials=include，不把访问令牌存入 localStorage。SSE 连接时鉴权，持续连接至少每 15 秒重查授权，撤权后关闭流。

创建者是唯一 OWNER。添加成员仅添加已有用户，首期不做邀请。OWNER 不能被移除或退出，不提供所有权转让。移除成员不删除其已创作内容。

| 操作 | OWNER | MEMBER |
| --- | --- | --- |
| 查看项目内容及成员列表 | 允许 | 允许 |
| 对话、上传、生成、编辑/删除项目内容和记忆 | 允许 | 允许，内容属共享项目 |
| 取消生成 | 任意任务 | 仅本人任务 |
| 项目改名/删除、添加/移除成员 | 允许 | 禁止 |
| 系统模型配置 | 禁止。平台管理员不是项目角色 | 禁止。平台管理员不是项目角色 |
| 任务人工核对 | 受控管理命令 | 受控管理命令 |

删除文档后历史引用显示“来源已删除”，不返回正文；删除被非终态任务引用的 Asset 返回 resource_in_use。整体项目删除由系统后台收尾，不受此单资源限制。

平台管理员由 users.platform_admin 表示，只能通过管理员命令设置。每次管理请求都从 PostgreSQL 重查该标记。项目 OWNER 与 MEMBER 都不能改模型目录。非管理员访问管理接口返回 404，不返回 403。

## 3. 首期路由契约

下表是待实现契约。普通 DTO 至少包含 id、created_at、updated_at；可编辑聚合增加 version。项目业务 DTO 不得返回 object_key、secret_ref 或会话哈希。模型管理响应可以返回 secret_ref 名称，不能返回密钥值。

| 方法与路径 | 请求要点 | 成功响应 |
| --- | --- | --- |
| GET /auth/csrf | 无 | 200 {csrf_token} |
| POST /auth/login | email,password；CSRF | 200 {user:{id,email,platform_admin}} + Cookie |
| GET /auth/me | 无 | 200 {id,email,platform_admin} |
| POST /auth/logout | CSRF | 204 |
| GET/POST /projects | POST: name(1–120 字)，创建 kind=standard 的创作空间 | 列表 / 201 Project |
| POST /projects/personal | CSRF。不接受名称或用户 ID | 200 当前用户的个人空间。没有未删除的个人空间时创建，名称为个人空间，调用者成为 OWNER。并发由部分唯一索引保证每人至多一个。删除后再次调用会新建，不恢复旧数据，也不改写其他空间 |
| GET/PATCH/DELETE P | PATCH: name,expected_version | Project / Project / 204 |
| GET/POST P/members | POST: user_id，固定 MEMBER | 列表 / 201 Member |
| DELETE P/members/{user_id} | 不允许 OWNER | 204 |
| GET/POST P/conversations | POST: title(1–120 字) | 列表 / 201 Conversation |
| GET/PATCH/DELETE P/conversations/{id} | PATCH: title,expected_version | Conversation / Conversation / 204 |
| GET P/conversations/{id}/messages | sequence 游标 | Message 列表（含引用） |
| POST P/conversations/{id}/messages | content,model_config_id,rag_mode(off/auto/required，默认 auto),memory_ids(默认空)；Idempotency-Key | 202 {run_id,user_message_id,status} |
| GET P/chat-runs/{id} | 无 | ChatRun |
| GET P/chat-runs/{id}/events | Last-Event-ID 可选 | SSE |
| POST P/uploads | filename,mime,size_bytes,kind；幂等键 | 201 {asset_id,upload_url,headers,expires_at}。这是项目内资源上传的目标契约，当前未实现，也不由用户素材直传替代 |
| POST P/uploads/{asset_id}/complete | sha256 | 200 Asset |
| GET /uploads | 登录 | 200 {items,limits}。只返回当前用户 status=uploaded 的素材，limits 来自服务端配置 |
| POST /uploads/token | filename,content_type,size,category(image/video/file)，可选 key；CSRF。不接受 user_id | 200 {token,key,domain,upload_url,expires_in}。key 由服务端生成。响应不含 Secret Key |
| POST /uploads/complete | key；CSRF | 200 UploadFile。核对 key 属于当前用户，并在七牛确认对象存在且大小、MIME 符合登记后才标记 uploaded |
| DELETE /uploads/{id} | CSRF | 204。按文件 ID 和当前用户删除七牛对象并标记 deleted。不能通过 key 删除任意对象 |
| GET/POST P/documents | POST: title,asset_id；幂等键 | 列表 / 202 {document_id,version_id,ingestion_status,index_status} |
| GET/DELETE P/documents/{id} | 无 | Document / 204 |
| POST P/documents/{id}/versions | asset_id,expected_version；幂等键 | 202 文档版本状态 |
| POST P/documents/{id}/retry | version_id；幂等键 | 202，仅重新执行失败阶段 |
| GET P/search | q(1–2000 字),kind(knowledge/memory),limit<=20 | {items:[{id,score,source}],next_cursor:null}，只支持 top-k |
| GET/POST P/memories | POST: content,kind,source?；显式保存即确认 | 列表 / 201 Memory |
| GET/PATCH/DELETE P/memories/{id} | PATCH: content,expected_version | Memory / 新修订 Memory / 204 |
| GET P/memories/{id}/revisions | 无 | 修订列表 |
| GET P/models | capability 可选 | 200 {items:[{id,provider,model_name,capability,config_version,parameters_schema,limits}]}。仅已启用配置，非成员 404，不含 secret_ref。产品页面不用它选择模型 |
| GET P/active-model | capability 必填 | 200 当前指定的公开模型；未指定或非成员 404。不含 secret_ref |
| POST P/text-completions | prompt(1–10000)；CSRF。不接受 model_config_id。服务端使用 text_generation 的当前指定 | 202 {id,status,content,error}。未指定返回 422。请求立即返回，不在请求内调用供应商 |
| GET P/text-completions/{id} | 无 | 200 同上。非成员或跨项目 404。不含密钥 |
| GET /admin/model-configs | 平台管理员 | 200 含 secret_ref 名称与 enabled。非管理员 404 |
| POST /admin/model-configs | provider、model_name、capability、parameters_schema、limits、secret_ref；CSRF。不得含密钥，不能指定 config_version | 201。服务端分配版本 |
| PATCH /admin/model-configs/{id} | {enabled:false}；CSRF | 200。只能停用，不能改已发布内容。若它是当前指定，同一事务清除 |
| GET/PUT/DELETE /admin/model-assignments | PUT body 只有 model_config_id。能力必须与配置相同，且配置已启用 | 列表含全部能力，未指定的模型字段为空。非管理员 404。DELETE 204 |
| GET/POST P/generation-tasks | POST: prompt,parameters,reference_asset_ids,kind（image 或 video，默认 image）；幂等键。不接受 model_config_id。图片 parameters 可为空，或只含 size（允许的宽x高）与 n（1–4），服务端使用 text_to_image。视频 parameters 只含 duration（5）和可选 size（1920*1080、1080*1920、1440*1440），服务端使用 text_to_video。reference_asset_ids 仍必须为空；ADR-026 通过 input_id 引用私有生成输入：image 执行 image_inpaint 且 parameters 为空、复用 text_to_image 指定；video 执行 image_to_video、复用 text_to_video 指定，duration 固定 5、resolution 来自 image-editor-options。列表可用 kind 过滤 | 列表 / 202 GenerationTask。未指定或不支持的参数返回 422。请求立即返回，不在请求内调用供应商。视频提交结果不明时保持 submitting 且不得重发 |
| GET P/assets/{id}/content | 无 | 200 图片或视频字节。先校验项目成员，再在事务外读取对象。非成员或跨项目 404 |
| GET P/generation-tasks/{id} | 无 | GenerationTask |
| POST P/generation-tasks/{id}/cancel | 无 | 200 当前任务。仅 queued 可取消。视频进入 submitting 或 running 后返回 409，不把任务标成 canceled |
| GET P/assets | kind | Asset 列表 |
| GET/DELETE P/assets/{id} | 无 | Asset / 204 |
| POST P/assets/{id}/download-url | 无 | 200 {url,expires_at} |

GenerationTask 必须含 id、status、phase、progress、model_config_id、created_at、updated_at、error（null 或 {code,message,retryable}）、output_asset_ids、reconciliation_required、allowed_actions、kind（image 或 video）。ChatRun 包含 status/error、user_message_id、assistant_message_id、partial_content、retrieval_status。参数合法取值只由该模型能力 schema 决定。图片 size 使用 x，文生视频 size 使用供应商要求的 *。

Project 为 {id,name,role,kind,version,created_at,updated_at}，kind 为 personal 或 standard。Member 为 {user_id,email,role}；Conversation 为 {id,title,version,created_at,updated_at}；Message 为 {id,sequence,role,content,completion_status,run_id,citations,created_at}。Document 包含 id/title/version、current_version_id、ingestion_status/index_status/error；Memory 包含 id/kind/content/version、current_revision_id、source、source_unavailable、confirmed_at；Asset 包含 id/kind/mime/size_bytes/status、宽高/时长和时间。上述业务 DTO 在实施时由 Pydantic 定义并生成 OpenAPI，细化可选字段不得改变已定义语义。

## 4. 上传

先在 PG 创建 uploading Asset，再发仅限该 key 的凭据，默认 10 分钟，限制大小与 MIME。complete 必须由服务端校验对象存在、大小、文件特征和摘要，再标 ready；不能信任客户端摘要或扩展名。未 ready 不可引用。过期/失败对象由清理任务删除。

签发失败时，同幂等键可以为原 Asset 重新签发，不创建新业务对象。生成输出由 Worker 下载并校验，限制地址/协议/重定向及下载大小。首期不公开任意 URL 导入接口。

## 5. SSE

标准 id/event/data；data 是包含 run_id 的 JSON；事件 ID 单调递增并绑定 run，前端去重。

- started：开始运行。
- delta：{text}，临时内容。
- citation：经过校验的临时引用。
- completed：{message_id}，最终 PG 提交后发送，前端重新拉取消息。
- failed：{code,message,partial_message_id?}，不把部分文本标成完整。
- snapshot：{status,partial_content,message_id?,last_event_id?}，缓冲过期时替换本地内容，禁止追加。

默认缓冲 15 分钟、每 run 2 MiB。至少每 2 秒或 1 KiB 将部分内容写入 PG partial 消息，以先到为准；崩溃可损失未持久化尾部，不承诺逐 token 无损恢复。缓冲达到上限时保留快照和最近事件。快照与后续事件必须按持久化水位衔接，不能重复追加快照已含文本。

终态 snapshot 结束订阅；运行中 snapshot 后接续新事件。每 15 秒发送心跳注释；401/404 停止重连。每用户最多 3 个 SSE 连接。重连不得触发新的模型调用。

## 6. DTO 补充约束

source 为 {type: manual/message/document, id?, version?}；非 manual 必须提供 id/version。revision 返回 id、revision_number、content、status、confirmed_by、confirmed_at、source；已删除正文不得通过 revisions 读回。citations 为 {ordinal,document_id,document_version_id,chunk_id,locator,source_status} 列表，source_status 为 available/deleted。

取消已 canceled 任务返回当前任务；succeeded/failed 返回 409 invalid_transition 并携带当前状态，不新发取消。创建 chat_run 已占用会话时不保存孤立用户消息，消息、运行、幂等键和 Outbox 必须一起成功或回滚。DELETE 已删除但仍能验证原项目归属的资源返回 204；无归属可验证时返回 404。

OpenAPI 是实际实现的机器契约，本文是其设计输入；初始化客户端时固定生成命令和版本并加入 CI。接口未实现前不提交一份虚构的生成客户端，不手工维护平行 DTO。示例响应中的省略字段不能作为后端省略必需字段的理由。

## 视频剪辑接口

新增项目内 `/editor/documents`、`/editor/media` 和 `/editor/renders` 契约，见 [视频编辑器](video-editor.md)。生成资产内容接口支持单区间 Range（206/416）。

## ADR-024 管理接口（已实现）

所有接口逐次验证有效会话、PG platform_admin；非管理员 404，未登录 401，写请求验证 Origin/CSRF，响应 no-store。

- GET `/api/v1/admin/users`：q、status、offset、limit；返回 items/total。
- PATCH `/api/v1/admin/users/{id}/status`：status、expected_updated_at。
- POST `/api/v1/admin/users/{id}/revoke-sessions`：expected_updated_at。
- GET `/api/v1/admin/generation-tasks`：kind、status、provider、project_id、actor_id、task_id、reconciliation_required、created_from/to、offset、limit；返回 items/total。时间必须带时区；limit 1–100，offset 0–100000。
- GET `/api/v1/admin/projects/{project_id}/generation-tasks/{task_id}`：安全运营元数据详情。
- POST 同路径 `/cancel`：复用现有取消用例，当前只有 queued 能取消；运行中返回 409。终态重复取消幂等保持现状。

用户写入禁止自己与任何平台管理员，版本不匹配 409；普通用户可通过后台恢复，但旧会话不恢复。不提供密码/邮箱修改、用户创建或管理员授权。跨项目任务 API 只返回安全元数据，不含提示词、request_snapshot、provider_task_id、原始异常、输出资源访问地址；项目 API 的成员检查不变。

## ADR-025 资产与导出接口

沿用平台管理员 PG 鉴权、404 隐藏管理面、写入 Origin/CSRF 和响应 no-store。

- GET `/api/v1/admin/uploads`；GET `/api/v1/admin/users/{user_id}/uploads/{file_id}`。
- GET `/api/v1/admin/assets`；GET `/api/v1/admin/projects/{project_id}/assets/{asset_id}`。
- GET `/api/v1/admin/editor-renders`；GET `/api/v1/admin/projects/{project_id}/editor-renders/{render_id}`；POST 同路径 `/cancel`。

列表 offset 0–100000、limit 1–100，默认 20；按 created_at/id 倒序。所有列表支持带时区 created_from/to，并拒绝倒置区间。上传支持 file_id/user_id/category/status；资产支持 asset_id/project_id/created_by/kind/status；导出支持 render_id/project_id/actor_id/document_id/status。具体 DTO 以生成 OpenAPI 为准。资产列表包含 items/total/active_size_bytes，后者排除 deleted 登记，含未完成上传。

不返回对象键、URL、文件名、工程标题、原始错误、快照/轨道或私有内容。详情按所属用户或项目和资源 ID 共同定位。导出仅 queued 可取消、canceled 重复请求幂等，其余状态返回 409；取消写审计，不触发新渲染。


### 图片编辑生成（ADR-026）

- `GET P/image-editor-options`：返回重绘和图生视频的可用性、原因、模型名、支持的清晰度和时长；需项目成员权限，无密钥和对象键。
- `POST P/generation-inputs`：CSRF；`id` 为客户端稳定 UUID，`image_base64` 为无前缀 Base64，重绘须带 `mask_base64`。每个文件最多 80 MiB、16,777,216 像素、边长不超过 8000；静态 PNG/JPEG/WebP。视频首帧宽高至少 240，透明区合成为白色。蒙版须同尺寸且非空，白编辑黑保留。返回 201 `{id,width,height}`。
- 同 ID 同内容上传完成后返回已有输入；内容改变返回 409。失败上传可使用同 ID 重试，上传中 10 分钟内拒绝并发覆盖。输入归属从路由和会话取，不接受外部 URL。
- 创建任务引用 ready 输入；`project_id + input_id` 复合外键防止跨项目关联。幂等摘要含规范化图片/蒙版内容摘要。输入不是作品，不出现在作品缩略图中。
- 新结果依旧由现有 GenerationTask 和授权 asset content 接口查询。禁止将编辑接口降级为文生图或用原图假装生成成功。


ADR-027：图片操作统一使用图片生成模型，视频操作统一使用视频生成模型。image_inpaint/image_to_video 仅表示操作类型，不再提供独立指定或新配置类别；历史记录保留且不影响新请求，已排队任务保持原模型快照。Qwen Image 3.0 的选区通过参考图引导，再由应用蒙版合成保证区域外不变，不宣称供应商原生支持 mask。

### 重绘大图输入

生成输入单文件上限为 80 MiB，base64 字符上限 111848108；仍限制静态图片、16,777,216 像素及单边 8000。原图与原尺寸蒙版保存在私有存储，供应商适配器仅缩放调用副本至最长边 2048 且每张不超过 8 MiB。结果回到原尺寸并按原蒙版合成，未选区像素不变。前端不再以模型调用副本的 8 MiB 限制拒绝原图。
