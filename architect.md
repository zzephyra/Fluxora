# Fluxora 架构与代码规范

状态：产品范围说明。工程约束以根目录 `ARCHITECTURE.md` 为准，架构决策见 `docs/adr/`。二者冲突时停止并确认，不得用实现代码悄悄选择。

本文中的 MUST / MUST NOT 仍是产品与隔离要求。新增架构决策必须先写 ADR，再改 `ARCHITECTURE.md`。

## 1. 产品范围与架构方向

Fluxora 是按项目组织的视频生成平台。首期覆盖用户登录、项目管理、项目内对话、知识库与 RAG、项目记忆、视频生成任务、资源管理与生成记录。

典型流程：创建项目 → 上传资料 → 对话并检索项目知识 → 编辑生成提示词和参数 → 用户明确提交生成 → 查看任务状态 → 预览与下载视频。

- 前后端分离：React 前端通过 HTTP API 访问 FastAPI 后端。
- 后端采用模块化单体，API 和 Worker 独立运行，共用领域逻辑；初期不拆微服务。
- 项目是业务数据、检索和记忆的隔离边界。跨项目共享、全局用户记忆默认不支持。
- LLM 可以提出生成方案，但不能绕过用户提交、权限、参数校验或额度检查直接创建付费生成。
- 首期不实现复杂时间线剪辑、多智能体自治、模型训练与支付系统。订单、计费及 Credits 如后续引入，仍必须遵守本文数据约束。

## 2. 默认技术栈

| 层次 | 选择 | 职责 |
| --- | --- | --- |
| 前端 | React + TypeScript + Vite | 独立 SPA |
| 页面与请求状态 | React Router + TanStack Query | 路由、服务端数据缓存与刷新 |
| UI | Tailwind CSS + shadcn/ui | 统一组件和设计 token |
| 后端 | FastAPI + Pydantic | API、校验、OpenAPI |
| 数据访问 | SQLAlchemy 2 + Alembic | 数据访问、事务、迁移 |
| 事实数据库 | PostgreSQL | 全部业务事实及可靠事件 |
| 检索 | Elasticsearch | 全文、向量、混合检索与聚合派生索引 |
| 异步执行 | Celery + Redis | 长任务执行、消息传递；PG 保存任务事实 |
| 文件存储 | S3 兼容对象存储 | 原始文件和生成媒体二进制 |
| 工具链 | uv；pnpm；Ruff；ESLint；Prettier | 依赖与代码风格 |

具体版本在初始化时验证兼容性并锁定，提交 uv.lock 和 pnpm-lock.yaml。不得混用包管理器、增加第二套 ORM、任务队列、UI 系统或向量数据库。新增运行时依赖需说明现有工具无法满足的具体需求。

## 3. 目录与依赖边界

```text
Fluxora/
├── architect.md
├── frontend/
│   ├── src/
│   │   ├── app/                 # 路由、Provider、应用入口
│   │   ├── features/            # auth/projects/chat/knowledge/memory/generation/assets
│   │   ├── components/ui/       # 无业务逻辑的通用 UI
│   │   ├── api/                 # OpenAPI 生成类型、统一请求客户端
│   │   └── lib/                 # 少量通用工具
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/                # 配置、认证、安全、日志、异常
│   │   ├── modules/             # auth/projects/chat/knowledge/memory/generation/assets
│   │   │   └── <module>/
│   │   │       ├── router.py    # HTTP 协议与依赖注入
│   │   │       ├── schemas.py   # 请求和响应 DTO
│   │   │       ├── service.py   # 用例、状态变化、事务边界
│   │   │       ├── repository.py # PG 查询与持久化
│   │   │       └── models.py    # ORM 模型
│   │   ├── integrations/       # LLM、Embedding、视频服务、ES、对象存储适配器
│   │   └── workers/            # 执行入口、Outbox 分发、同步及恢复任务
│   ├── migrations/
│   ├── tests/
│   └── pyproject.toml
├── infra/                      # 本地服务与部署配置
└── docs/adr/                    # 架构决策记录
```

依赖方向：Router / Worker → Service → Repository 或适配器接口。Router 不写 SQL，不编排 RAG；Repository 不做权限策略和流程编排；供应商适配器不决定业务状态。Worker 必须复用 Service，不能复制业务逻辑。

模块间通过公开 Service 或明确的数据接口协作，禁止互相调用 Router、访问私有实现、产生循环依赖。仅在出现实际复用时抽象公共模块，禁止提前建立通用 Agent 框架、万能 BaseService 或堆积业务代码的 utils。

## 4. 数据架构：PostgreSQL 是唯一业务事实源

### 4.1 强制写入规则

PostgreSQL MUST 保存所有业务事实：用户、成员权限、项目、会话消息、任务状态、生成记录、视频/图片元数据、模型配置、业务配置，以及未来的订单、支付、计费、Credits、Quota。

所有业务 Create / Update / Delete 首先作用于 PG。普通业务查询直接查询 PG；权限、余额、支付、任务状态、用户状态、额度等最终判断 MUST 查询 PG。

对象存储保存大文件字节；对象归属、存储键、哈希、版本和生命周期以 PG 为准。Redis、队列与 ES 均不可保存唯一业务事实。媒体字节及原始文件必须有备份与恢复策略；ES 重建可读取 PG 记录引用的原始对象。

Elasticsearch 仅承担 Full Text Search、模糊搜索、组合搜索、Search Suggestions、高性能检索和 Aggregation。它保存 Derived Data / Search Index，可删除、可重建、可迁移，不是主数据库。ES 中不得存在无法从事实源恢复的唯一数据。

普通业务 Service MUST NOT 同时调用 PG 写入和 ES index；MUST NOT 为 PG + ES 同时成功引入分布式事务。

### 4.2 同步与最终一致性

初版明确选择 Transactional Outbox：

```text
Business Request → Application Service
  → PG transaction：业务记录 + Outbox event → commit → 返回业务成功
  → Outbox Dispatcher → Celery / Redis → Index Worker → Elasticsearch
```

- 业务记录和 Outbox 必须在同一个 PG 事务中写入。提交成功后，即使 ES 不可用，业务操作仍成功。
- Outbox 至少包含 event_id、event_type、aggregate_id、project_id、aggregate_version、schema_version、payload、created_at，以及重试和投递状态。
- 采用至少一次投递；投递成功标记前崩溃可能造成重复，消费者必须幂等。消息成功消费前不得提前确认。
- PG 保留事件处理状态或可恢复的执行记录；队列丢失后可扫描未完成记录重新投递，不能只依赖 Redis。
- 索引按业务版本更新，防止旧事件覆盖新文档；删除使用带版本的墓碑和幂等删除，防止乱序消息恢复已删除内容。
- 暂时错误采用指数退避、抖动和最大次数；永久错误进入 PG 失败记录，可人工重放并报警。
- 定期按更新时间、版本和数量进行对账，修复漏索引、过期索引及未清理数据。

### 4.3 搜索与重建

```text
复杂搜索 → ES（服务端强制 project_id 过滤）
        → 命中 ID、分数 → PG 回查 → 权限/删除/版本校验 → 返回
```

项目内容、RAG 分块和任务搜索的结果 MUST 回查 PG，按命中顺序输出有效结果。ES 中的状态只作候选信息；PG 为 SUCCEEDED 时不得以 ES 的 RUNNING 覆盖。被删除、失权或过期的命中必须丢弃，不能把 ES 文本直接返回给用户或模型。

搜索聚合是最终一致的统计，不得用作计费或权限判断。私有项目的聚合必须限定在 PG 授权后的项目范围内。

索引使用版本名及逻辑 alias，例如 knowledge_v1 / knowledge_read。重建流程：记录同步水位 → 从 PG 分批构建新索引 → 回放水位之后的增量与删除 → 校验数量、版本、抽样内容及隔离 → 追平后切换 alias。切换需协调分发与写入目标，避免切换窗口丢事件；旧索引保留短期回滚窗口。重建任务必须支持断点恢复、限流及失败重试。

ES 故障时普通业务和任务状态查询继续通过 PG 工作；知识检索明确返回暂不可用，不得静默假装检索成功。

## 5. 项目隔离与核心数据模型

所有项目资源必须有非空 project_id；全局用户与系统级模型配置属于明确例外。所有业务时间使用 UTC，资源 ID 使用 UUID，数据库列用 snake_case。跨资源关系使用外键和必要的复合约束，防止不同项目的 conversation、document、asset 被错误关联。

| 实体 | 核心职责 |
| --- | --- |
| users / projects / project_members | 身份、项目与 OWNER / MEMBER。完整 RBAC 以后再扩展 |
| conversations / messages / chat_runs | 对话、持久消息、流式生成运行状态 |
| documents / document_versions / chunks | 原文件引用、版本、解析文本、分块、引用坐标 |
| memories | 项目记忆、来源、版本、有效状态与撤销记录 |
| generation_tasks / generation_attempts | 视频任务、供应商调用尝试、状态和失败记录 |
| assets | 视频/图片等资源归属、对象键、媒体属性与来源 |
| model_configs | 服务端允许的模型、能力、参数限制及密钥引用 |
| outbox_events / event_deliveries | 可靠业务事件、消费者执行与恢复状态 |

每个请求先认证，再从 PG 验证当前用户的项目成员身份。首期只有 OWNER 与 MEMBER，不实现 Role、Permission、Policy。角色变更等敏感操作必须在执行时重新校验。详见 ADR-013。

- project_id 来自已授权路由上下文，不信任请求体中任意归属字段。
- 项目资源 Repository 接口必须要求 project_id，不提供对外通用的无范围 get_by_id。
- Worker 执行前重新检查项目、资源和发起人权限；项目已删除或权限已撤销时禁止继续提交新外部调用。
- ES 过滤、缓存键、对象路径、任务事件和日志上下文必须携带项目范围。
- 前端缓存键包含 project_id；切换项目时终止旧流和旧请求，禁止旧响应写入当前项目页面。
- 同项目会话可使用项目记忆；会话历史仍按 conversation_id 隔离。禁止通过邮箱、相似度或用户 ID 进行跨项目记忆召回。
- 项目删除先在 PG 标记不可访问并写入清理事件，再异步清理索引和对象；清理完成前也不得返回残留数据。

## 6. 视频生成链路

1. 前端提交显式确认后的 prompt、模型配置 ID、结构化参数及参考资源 ID，并发送 Idempotency-Key。
2. Service 校验成员权限、项目资源归属、模型能力和参数；如启用额度，在同一 PG 事务中预留额度。
3. PG 保存任务、不可变请求快照与 Outbox 事件，返回 202 和 task_id。
4. Worker 领取任务，调用视频供应商适配器；提交成功后保存 provider_task_id，通过轮询或验签回调获取进展。
5. 将输出保存到受控对象存储，确认对象存在，再在 PG 事务中创建 Asset、关联结果并标记成功。
6. 前端轮询任务 API；成功后获取短期签名链接进行预览或下载。

任务状态限定为 queued → submitting → running → succeeded / failed；queued 可转 canceled，running 可转 cancel_requested，取消确认后转 canceled。竞态中若已完成，可以从 cancel_requested 转 succeeded。终态不可回退，状态迁移必须通过 Service 并用版本条件更新。

- 取消尽力执行，不能把“已请求取消”展示为“已取消”。供应商不支持取消时需明确告知。
- 幂等键按 project_id + actor_id + operation 唯一，并校验请求哈希；同键不同请求返回 409。
- 任务领取需要锁/租约和心跳，超时后由恢复任务接管；不得让并发 Worker 重复执行同一提交。
- 外部提交超时结果不明时，先以供应商幂等键或查询接口核对。无法确认时进入人工核对流程，禁止盲目重试导致重复收费。
- 用户重试失败任务创建新任务并保留原任务关联；底层瞬时失败重试记录在 generation_attempts。
- 若启用 Credits，预留、结算和释放使用 PG 唯一业务键与账本保证幂等，不根据 ES 或供应商重复回调重复扣费。
- 长任务不在 FastAPI 请求或进程内 BackgroundTasks 中完成。数据库事务不得覆盖供应商请求或上传过程。

## 7. 对话、RAG 与记忆

### 7.1 对话

POST 创建持久消息和 chat_run，返回运行 ID；Worker 执行模型调用，浏览器用经过鉴权的 SSE 读取事件。事件最少包含 event_id、run_id、type 和 data，类型统一为 started / delta / citation / completed / failed。

用户消息与运行记录先入 PG；assistant 最终消息、引用及模型调用元数据写入 PG 后才能发送 completed。短期流事件可进入 Redis 并设置保留期，最终业务结果始终来自 PG。断线不自动取消运行，重连支持 Last-Event-ID；事件已过期则返回 PG 中的运行快照。失败的部分输出不得标记为完整答案。

每个会话默认只允许一个活跃 chat_run，通过 PG 约束或锁保证；并发提交返回 409。上下文长度与输出 token 设置上限，超限执行有版本记录的摘要。系统提示词和提示词模板在后端集中管理、版本化，不能散落在 Router 或前端。

### 7.2 RAG

入库链路：上传并校验文件 → PG 文档记录与 Outbox → 异步解析 → 规范化分块 → PG 保存原文、分块、页码/段落位置与版本 → Embedding → ES 索引。PG 单独记录 ingestion_status 与 index_status，允许“解析成功、索引失败”，不能把两者混为一个状态。

检索链路：授权项目 → 查询规范化 → ES 项目内全文/向量混合召回 → PG 校验命中版本、来源和可访问性 → 可选重排 → token 预算裁剪 → 组装上下文 → 模型回答并提供引用。

- 分块规则、embedding 模型/维度、索引映射和检索参数必须版本化。切换 embedding 模型应重建对应索引，禁止混用不兼容向量。
- embedding 是可重新计算的派生数据；不能只在 ES 保存分块原文、来源或唯一生成记录。
- 文档更新后旧版本默认不可用于 RAG；索引未追平期间应报告资料处理中。
- 引用至少包含 document_id、document_version、chunk_id 与可定位的页码/段落，最终引用关系持久化到 PG。
- 无有效证据时明确说明；检索文本是非可信资料，不得覆盖系统指令、改变权限或触发工具调用。

### 7.3 项目记忆

记忆用于项目内稳定事实，如角色设定、视觉风格和用户确认的创作要求。原始对话不是自动可信的长期记忆。

- 默认由用户显式保存，或模型提出候选后由用户确认。模型不能静默改写既有设定。
- memories 在 PG 保存 project_id、内容、类型、来源消息/文档、版本、创建人、确认时间与 active/superseded/deleted 状态。
- 用户可查看、编辑、撤销和删除记忆；更新保留版本关系，不直接丢失来源。
- 召回先按授权项目和 active 状态过滤；ES 仅生成候选，PG 验证后才进入上下文。
- 当前明确指令与记忆冲突时优先处理当前指令，并提示用户是否更新记忆；不能因一次临时指令自动改写记忆。
- 不自动存储密钥、支付信息等敏感数据；记忆摘要不可成为原始事实的唯一副本。

## 8. API 契约

统一前缀 /api/v1，项目资源统一嵌套在 /projects/{project_id} 下，例如：

```text
POST /api/v1/projects
GET  /api/v1/projects/{project_id}
POST /api/v1/projects/{project_id}/conversations
POST /api/v1/projects/{project_id}/conversations/{conversation_id}/messages
GET  /api/v1/projects/{project_id}/chat-runs/{run_id}
GET  /api/v1/projects/{project_id}/chat-runs/{run_id}/events
POST /api/v1/projects/{project_id}/documents
GET  /api/v1/projects/{project_id}/search
GET/POST/PATCH/DELETE /api/v1/projects/{project_id}/memories[/{memory_id}]
POST /api/v1/projects/{project_id}/generation-tasks
GET  /api/v1/projects/{project_id}/generation-tasks/{task_id}
POST /api/v1/projects/{project_id}/generation-tasks/{task_id}/cancel
GET  /api/v1/projects/{project_id}/assets/{asset_id}
```

成功响应使用明确 DTO，不增加无意义的统一 data 包装；列表统一 items / next_cursor。错误统一 error.code / error.message / error.details / request_id，使用实际 HTTP 状态码，禁止 HTTP 200 表达失败。时间字段为 ISO 8601 UTC，分页有默认值与最大上限。

前端类型从 OpenAPI 生成，禁止另写一套可能漂移的类型。API 不返回 ORM 对象、供应商原始响应、密钥或内部异常堆栈。模型配置与可选参数由后端能力接口提供，前端不得自行猜测供应商支持范围。

## 9. 前端开发规范

- TypeScript strict 模式，禁止用 any 或 ts-ignore 掩盖问题；边界数据先校验再使用。
- 页面按业务 feature 组织。组件渲染 UI，hooks 封装交互与请求，api 层集中处理鉴权、错误及取消。
- 服务端状态由 TanStack Query 管理；本地表单和交互状态使用 React state，不复制一套任务状态到全局 store。
- 颜色、字体、间距使用统一 token；复用 components/ui，禁止每个页面重建按钮、弹窗、表格或引入另一套样式方案。
- 每个异步页面必须覆盖 loading、empty、error、success；长任务展示真实状态、失败原因和允许的操作，不伪造进度。
- 任务提交按钮防重复，但最终去重依赖后端幂等。服务端确认前不展示生成成功。
- 基础页面：项目列表、项目工作台、对话、知识库、记忆管理、生成记录、资源库及项目设置。
- 默认桌面优先并支持窄屏；交互元素提供可访问名称、键盘操作和明显的焦点状态。

## 10. 后端、安全与运维规范

- Python 公共接口使用类型标注，Pydantic DTO 与 ORM 模型分开。配置通过统一 Settings 从环境读取。
- Service 定义事务边界；Repository 不自行 commit。异步代码不得调用阻塞网络客户端；网络请求统一超时、取消与有限重试。
- 业务错误使用明确异常与错误码，由统一异常处理器转换；禁止 except Exception 后吞错或返回空成功。
- API、Worker、Outbox Dispatcher 可独立部署。开发环境通过 Compose 提供 PG、ES、Redis 和对象存储，配置样例不能包含真实凭据。
- 浏览器首期使用 HttpOnly、Secure、SameSite 会话 Cookie，状态变更校验 CSRF；会话与撤销状态以 PG 为准。CORS 使用明确白名单，不能带凭据允许任意来源。
- 供应商密钥仅后端可读，PG 保存密钥引用而非向客户端返回明文。上传设置格式、大小、解析超时与数量上限。
- 外部 URL 导入需限制协议、地址和重定向，防止访问内网；对象桶默认私有，签名 URL 仅在鉴权后短期签发。
- 回调验证签名、时效并去重；供应商状态经过适配与 Service 验证后才进入 PG。
- 结构化日志记录 request_id、project_id、task_id、run_id；默认不记录原始提示词、文档内容、token 或密钥。
- 监控 API 延迟、任务排队时间、供应商错误、Outbox 积压、索引延迟和重试失败。健康检查区分存活与依赖就绪。
- 数据库变更必须经 Alembic，禁止生产启动自动 create_all。备份包括 PG 与对象存储，并定期验证恢复。

## 11. 测试与交付门槛

首期必须验证下列业务风险，不能仅测试函数是否按实现调用：

1. A 项目用户无法读取、检索、召回、修改或引用 B 项目的消息、记忆、文档、任务与资源。
2. PG 提交成功而 ES/Redis 故障时，业务结果正确，恢复后事件可重放且索引追平。
3. 重复或乱序事件、删除事件、重复回调不能覆盖新状态、恢复删除数据或产生重复资源。
4. 重复提交、Worker 崩溃、供应商超时、取消竞态不导致重复外部任务或错误终态。
5. 对话断线可恢复，失败输出不会被当作完整消息；文档更新/删除后不能引用失效分块。
6. 索引可从事实源重建，增量和删除可追平，alias 切换后结果与权限正确。

后端使用 pytest；数据库、事务与索引测试使用实际测试 PG/ES，供应商调用使用可控替身。前端使用 Vitest + Testing Library，核心“创建项目 → 对话 → 生成 → 查看结果”使用 Playwright。CI 运行格式、lint、类型检查、必要测试和前端 build，并验证 OpenAPI 客户端同步。

## 12. AI 与协作者修改规则

开始实现前必须阅读本文及受影响模块代码。每次变更应满足：

- 明确归属模块、API 契约、数据模型和状态迁移后再写代码。
- 先复用现有实现，不随意改目录结构、命名、依赖或代码风格。
- 业务数据先写 PG；所有新增项目资源和检索入口必须带项目隔离。
- 外部服务必须经过 integrations；不能把 SDK 调用散落在 Router、组件和 Worker 中。
- 新增持久字段必须有迁移；变更 API 必须更新 OpenAPI 类型；变更行为必须覆盖相应风险测试。
- 不引入未请求的功能或大规模重构，不用假数据掩盖未实现功能。开发替身必须明确标记并与生产配置隔离。
- 完成说明必须列出改动、验证及未解决限制。未执行的检查不能宣称通过。
- 引入新基础设施、跨项目数据共享、修改计费或状态模型前，先记录 ADR 并更新本文。

本文件是设计规范，不保证所有 AI 工具自动读取。初始化工程时应在根目录 AGENTS.md 中显式要求先阅读 architect.md，并通过 CI 和边界测试落实关键约束；不能仅依靠提示词保证隔离和一致性。

## 13. 建议实施顺序

1. 工程骨架、认证、项目成员权限、PG 迁移、统一错误与日志、前端基础布局。
2. Outbox 与 Worker、视频供应商接口、任务状态机、对象存储、生成记录；先用受控替身打通端到端链路。
3. 持久对话、流式事件、模型配置与真实供应商接入。
4. 文档解析、PG 分块、ES 异步索引、RAG 引用及索引重建。
5. 用户确认的项目记忆、权限回归、恢复演练与部署验收。

已确定：视频状态默认同步方式为 Polling，Webhook 只留在 Provider 边界；知识库首期文件为 PDF、DOCX、TXT、Markdown；成员角色为首期 OWNER / MEMBER。仍待后续阶段确定：首个视频、LLM、Embedding 供应商，文件大小上限，生成参数与并发限额，数据保留周期，是否启用 Credits。
