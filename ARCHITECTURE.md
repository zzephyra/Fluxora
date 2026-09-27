# Fluxora Architecture

状态：已确认。本文是工程架构约束。产品范围见 `architect.md`。决策记录见 `docs/adr/`。

本文中的 MUST、SHOULD、MUST NOT 是强制程度。改变这些约束必须先写 ADR，得到确认后再改本文和代码。

## 1. System Overview

Fluxora 是按项目组织的视频生成平台。用户在项目内上传资料、对话检索、确认记忆、提交视频生成，并查看任务和成片。

首期包括：登录、项目与成员、项目内对话、知识库与 RAG、项目记忆、视频生成、资源和生成记录。

首期不包括：时间线剪辑、多智能体自治、模型训练、支付和 Credits 账本。

项目是数据、检索和记忆的隔离边界。默认不支持跨项目共享，也不支持全局用户记忆。

## 2. Architecture Principles

优先级：Correctness > Maintainability > Simplicity > Extensibility > Cleverness。

默认形态是模块化单体加异步 Worker。没有明确需求时，不引入微服务、事件溯源、CQRS、Kubernetes 或额外的框架。

- PostgreSQL MUST 是唯一业务事实源。
- Elasticsearch MUST 只作为可删除、可重建的搜索索引。
- Redis MUST NOT 保存唯一业务事实。
- 对象存储 MUST 保存文件和媒体字节；归属和生命周期以 PostgreSQL 为准。
- 长时间任务 MUST 离开 HTTP 请求。
- AI 供应商调用 MUST 经过 Model Gateway。
- Domain MUST NOT 依赖 FastAPI、SQLAlchemy、Elasticsearch、Redis、LangChain、Celery 或供应商 SDK。

## 3. Technology Stack

| 层次 | 选择 | 约束 |
| --- | --- | --- |
| 前端 | React、TypeScript、Vite | SPA |
| 路由与服务端状态 | React Router、TanStack Query | 不把服务端状态放进全局 store |
| UI | Tailwind CSS、shadcn/ui | 不并行第二套组件库 |
| 后端 | Python、FastAPI、Pydantic | Router 保持轻量 |
| 数据访问 | SQLAlchemy 2 async、asyncpg、Alembic | 唯一 ORM 和迁移工具 |
| 事实数据库 | PostgreSQL | Source of Truth |
| 检索 | Elasticsearch | 全文、过滤、聚合、向量 |
| 异步 | Celery；Redis 作 broker | 任务真值在 PostgreSQL |
| 文件 | S3 兼容对象存储；开发环境 MinIO | boto3 |
| AI 文本实现 | LangChain | 只存在于文本适配器 |
| 工具 | uv、pnpm、Ruff、ESLint、Prettier | 不混用包管理器 |

首期不引入 Zustand、React Hook Form、Zod、LangGraph、第二套向量数据库或 Celery result backend。出现具体需求时再评估。

版本在初始化时锁定到 `uv.lock` 和 `pnpm-lock.yaml`。

## 4. Architecture Diagram

```text
React SPA
  │  HTTP / SSE
  ▼
FastAPI
  ▼
Application Service
  ├── Domain rules
  ├── PostgreSQL Repository
  ├── AI Port ── Model Gateway ── Provider Adapter
  │                 └── LangChain 仅用于文本 / RAG 适配器
  ├── Search Gateway ── Elasticsearch
  └── Storage Gateway ── Object Storage

同一 PostgreSQL 事务：业务写入 + Outbox
  ▼
Dispatcher ── Celery / Redis ── Worker
  Worker 调用同一套 Application Service
```

## 5. Backend Architecture

```text
Router / Worker
  → Application Service
    → Domain
    → Repository / Gateway
      → Infrastructure
```

Router MUST 只处理 HTTP、校验、认证上下文和响应序列化。

Router MUST NOT 写 SQL、编排 RAG、调用 Elasticsearch、调用 LangChain 或调用供应商 SDK。

Service MUST 划定事务和用例边界。Repository MUST NOT commit，也 MUST NOT 做权限策略。供应商适配器 MUST NOT 决定业务状态。

Worker MUST 复用 Service，禁止复制一套业务逻辑。

模块目录在文件变长之前保持扁平：

```text
backend/app/modules/<module>/
  router.py
  schemas.py
  service.py
  domain.py
  repository.py
  models.py
```

`models.py` 是 ORM。领域状态和迁移规则放在 `domain.py`。

## 6. Frontend Architecture

```text
frontend/src/
  app/             # 路由、Provider、入口
  features/        # auth、projects、chat、knowledge、memory、generation、assets
  components/ui/   # 无业务通用组件
  api/             # OpenAPI 生成的类型和客户端
  lib/
```

- TypeScript MUST 使用 strict。禁止用 `any` 或 `@ts-ignore` 掩盖边界数据。
- 服务端状态 MUST 由 TanStack Query 管理。
- 客户端交互状态 SHOULD 留在组件 state。首期 MUST NOT 引入全局 store 来复制任务状态。
- API 类型 MUST 从 OpenAPI 生成。
- 缓存键 MUST 包含 `project_id`。切换项目时 MUST 取消旧请求和旧事件流。
- 每个异步界面 MUST 有 loading、empty、error、success。长任务展示服务端真实状态，不伪造进度。
- 提交按钮可以防重复点击，最终去重 MUST 由后端幂等保证。服务端确认前不得显示生成成功。

基础页面：项目列表、项目工作台、对话、知识库、记忆、生成记录、资源库、项目设置。

## 7. Module Boundaries

| 模块 | 拥有 | 不拥有 |
| --- | --- | --- |
| auth | 用户、会话 | 项目角色 |
| projects | 项目、成员、角色 | 生成与检索 |
| chat | 会话、消息、chat_run | 索引写入、供应商 SDK |
| knowledge | 文档、版本、分块、入库状态 | 其他模块的表 |
| memory | 已确认的项目记忆 | 自动把对话变成记忆 |
| generation | 生成任务、尝试、幂等键 | 媒体字节 |
| assets | 资源元数据和签名访问 | 业务状态机 |

Search、Storage、Model Gateway、Outbox 属于 `backend/app/infrastructure/`，不是业务模块。

模块 A MUST NOT 读取或写入模块 B 的表。需要数据时调用对方的 Application Service 或 Port。

禁止循环依赖。发现环时停止并重新划分边界，不得用延迟 import 掩盖。

## 8. Dependency Direction

```text
auth
projects    → auth
knowledge   → projects, assets, search port, embedding port
memory      → projects, search port
chat        → projects, knowledge, memory, text AI port
generation  → projects, assets, model capability, video port
assets      → projects, storage port
```

基础设施可以被 Service 注入。适配器 MUST NOT import 业务 Service。

只有出现第二次真实复用时才提取公共模块。MUST NOT 预先建立万能 BaseService、通用 Agent 框架或堆积业务代码的 utils。

## 9. PostgreSQL Architecture

PostgreSQL MUST 保存：用户、会话、成员权限、项目、消息、对话运行、文档与分块、记忆、生成任务与尝试、资源元数据、模型配置、Outbox，以及未来的订单、支付、Credits 和 Quota。

所有业务 Create、Update、Delete MUST 首先作用于 PostgreSQL。

约定：

- 主键 UUID。
- 时间 UTC，API 使用 ISO 8601。
- 列名 snake_case。
- 项目资源 MUST 有非空 `project_id`。
- 跨资源关系使用外键和复合约束，防止不同项目的会话、文档和资源被关联。
- 项目资源 Repository MUST 要求 `project_id`，MUST NOT 提供无范围的对外 `get_by_id`。
- `project_id` MUST 来自已授权路由上下文，不信任请求体中的归属字段。

Session MUST 由统一 Unit of Work 管理。禁止业务代码到处创建 Session。

删除项目时先在 PostgreSQL 标记不可访问并写清理事件，再异步清理索引和对象。清理完成前也不得返回残留数据。

详见 [ADR-002](docs/adr/002-postgresql-source-of-truth.md)。

## 10. Elasticsearch Architecture

Elasticsearch MUST NOT 作为主数据库，也 MUST NOT 判断权限、余额、支付、配额、用户状态或任务真值。

首期索引：

| 索引 | 别名 | 内容 |
| --- | --- | --- |
| `knowledge_vN` | `knowledge_read` | 分块文本与 embedding |
| `memory_vN` | `memory_read` | 记忆候选 |

生成任务列表走 PostgreSQL。

搜索流程：

```text
已授权 project_id
  → Elasticsearch（服务端强制 project_id）
  → 命中 ID
  → PostgreSQL 回查版本、删除和权限
  → 有效内容才进入响应或模型上下文
```

ES 中的状态只是候选。PostgreSQL 为 `succeeded` 时，不得用索引里的 `running` 覆盖。失效命中 MUST 丢弃。

Embedding 模型、维度、分块规则、mapping 和检索参数 MUST 版本化。更换 embedding 模型 MUST 重建对应索引。

详见 [ADR-003](docs/adr/003-elasticsearch-search-index.md)。

## 11. PG → ES Synchronization

MUST 使用 Transactional Outbox：

```text
业务记录 + outbox_events  →  同一事务 commit  →  业务成功
Dispatcher  →  Celery  →  Index Worker  →  Elasticsearch
```

普通 Service MUST NOT 连续调用 `postgres.save()` 和 `elasticsearch.index()`。MUST NOT 为两边同时成功引入分布式事务。

- 投递至少一次，消费者 MUST 幂等。
- 更新 MUST 按聚合版本执行，旧事件不得覆盖新文档。
- 删除 MUST 使用带版本的墓碑。
- 暂时错误 SHOULD 指数退避；永久错误进入 PostgreSQL 失败记录。
- 队列丢失后 MUST 能从 PostgreSQL 重新投递。
- 重建 MUST 写入新版本索引，校验后切换 alias，并保留短期回滚窗口。

`ingestion_status` 与 `index_status` MUST 分开。允许解析成功而索引失败。

索引未追平时，检索 SHOULD 报告资料仍在处理，而不是把旧版本当作当前资料。

详见 [ADR-004](docs/adr/004-pg-es-transactional-outbox.md)。

## 12. AI Architecture

```text
Business Service
  → AI Application Port
    → Model Gateway
      → Provider Adapter
        → Provider SDK / API
```

业务代码 MUST NOT 知道具体 SDK。能力至少区分 `text_generation`、`embedding`、`text_to_video`、`image_to_video`。不得为了统一接口抹平供应商差异。

模型配置由后端能力接口提供。前端 MUST NOT 猜测供应商参数。

供应商的 429、5xx、超时、网络错误和内部错误 MUST 被分类。结果不明时先查询，禁止盲目再次提交付费请求。

调用日志 SHOULD 包含 provider、model、latency、status、error_type、retry_count、usage。日志 MUST NOT 包含 API Key、密码、会话令牌、原始提示词或文档正文。

## 13. LangChain Boundary

LangChain MUST 只实现文本侧的模型抽象、提示词、结构化输出和 RAG 组装。

```text
Domain / Application
  → AI Port
    → LangChain Adapter
```

Domain MUST NOT import LangChain。

MUST NOT 把普通业务、权限、Outbox、视频轮询或取消包装成 Chain、Agent、Tool 或 Graph。

首期 MUST NOT 引入 LangGraph，MUST NOT 实现自治多智能体。模型不能静默修改记忆、权限或生成任务。

检索到的文本是不可信资料。

详见 [ADR-008](docs/adr/008-model-gateway-langchain-boundary.md)。

## 14. Model Gateway

Gateway MUST 是所有模型调用的唯一出口，包括 LLM、Embedding 和视频生成。

PostgreSQL 中的 `model_configs` 保存服务端允许的模型、能力、参数限制和密钥引用。密钥明文 MUST 只存在于服务端配置，接口 MUST NOT 返回明文。

Generation Service MUST NOT 直接依赖 Polling 或 Webhook。它只消费 Provider 返回的远程观察结果。

首期默认状态同步是 Polling。Provider 可以声明自己使用 Polling 或 Webhook。某个供应商以后改用 Webhook 时，只替换该 Provider 的同步方式，不改任务状态机。首期 MUST NOT 为 Webhook 增加公网入口、验签框架或独立事件基础设施。真正接入 Webhook 时，回调仍 MUST 验签、限时并去重，再转换成同一种远程观察结果。

新增供应商 MUST 增加适配器和能力声明，而不是在 Router 或前端增加分支。

详见 [ADR-011](docs/adr/011-video-status-sync.md)。

## 15. Async Task Architecture

以下工作 MUST 异步执行：视频生成、长文本模型调用、文档解析、Embedding、批量处理、索引和重建。

禁止：

```text
HTTP Request → 等待数分钟 → 返回结果
```

也禁止用 FastAPI BackgroundTasks 完成上述工作。数据库事务 MUST NOT 包住供应商请求或文件上传。

公开状态：

```text
queued → running → succeeded | failed | canceled
```

仅视频任务可以额外使用 `submitting` 和 `cancel_requested`。终态不可回退。`cancel_requested` MUST NOT 被展示为 `canceled`。供应商不支持取消时必须明确返回。

任务记录 SHOULD 包含 id、type、status、progress、input、result、error、retry_count、max_retries，以及 created、queued、started、finished 时间。是否全部落列由该用例决定，但状态和时间必须足以恢复。

可靠性 MUST 覆盖：重试、超时、幂等、重复执行、Worker 崩溃、供应商超时、429、5xx、恢复和取消。

领取任务 MUST 使用租约和心跳。用户重试创建新任务；同一次提交的瞬时重试写入 attempt。

对话：先写 PostgreSQL 中的用户消息和 `chat_run`，再用鉴权 SSE 推送 `started`、`delta`、`citation`、`completed`、`failed`。最终助手消息 MUST 先写入 PostgreSQL，然后才能发送 `completed`。Redis 可以暂存流事件。断线不自动取消；重连使用 `Last-Event-ID`，过期则返回 PostgreSQL 快照。失败的部分输出 MUST NOT 标成完整答案。每个会话同时只允许一个活跃 run，冲突返回 409。

详见 [ADR-005](docs/adr/005-celery-redis-workers.md) 与 [ADR-009](docs/adr/009-task-state-machine.md)。

## 16. Storage Architecture

```text
Asset
  ├── IMAGE
  ├── VIDEO
  ├── AUDIO
  └── FILE
```

字节 MUST 进入对象存储。PostgreSQL 保存 asset_id、object_key、校验和、MIME、大小、宽高、时长、状态、来源和项目归属。

桶 MUST 默认私有。签名 URL MUST 在授权后短期签发。

上传 MUST 限制格式、大小、数量和解析超时。外部 URL 导入 MUST 限制协议、目标地址和重定向，防止访问内网。

详见 [ADR-006](docs/adr/006-s3-object-storage.md)。

## 17. API Architecture

统一前缀 `/api/v1`。项目资源嵌套在 `/projects/{project_id}` 下。

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

成功响应 MUST 使用明确 DTO，不增加无意义的统一 `data` 包装。列表使用 `items` 和 `next_cursor`。

错误 MUST 使用：

```text
error.code
error.message
error.details
request_id
```

HTTP 状态码 MUST 表达成败。禁止用 HTTP 200 表示失败。

生成提交 MUST 接受 `Idempotency-Key`。相同键和相同请求返回原任务；相同键、不同请求返回 409。长任务创建成功返回 202 和 `task_id`。

分页 MUST 有默认值和上限。API MUST NOT 返回 ORM 对象、供应商原始响应、密钥或内部堆栈。

变更公开 URL、字段或错误码视为公开 API 变更，MUST 在变更说明中写出，MUST NOT 静默修改。

## 18. Authentication

首期使用服务端会话 Cookie：HttpOnly、Secure、SameSite。变更请求 MUST 校验 CSRF。会话撤销以 PostgreSQL 为准。

CORS MUST 使用明确白名单。禁止携带凭据并反射任意 Origin。

认证与授权 MUST 分开。登录只证明身份。

详见 [ADR-007](docs/adr/007-cookie-session-auth.md)。

## 19. Authorization

每个项目请求 MUST 先认证，再从 PostgreSQL 检查成员身份。

首期只有两种成员关系：

- OWNER：管理项目及其成员。
- MEMBER：在项目内编辑内容并提交生成。

MUST NOT 在首期实现 Role、Permission、Resource、Policy 组成的 RBAC。数据模型 SHOULD 把角色存成可扩展字段，而不是把权限判断写死在多个布尔列上。ADMIN、EDITOR、VIEWER 和细粒度权限以后必须通过新的 ADR 引入。

详见 [ADR-013](docs/adr/013-project-membership-roles.md)。

敏感操作 MUST 在执行时重新校验，不能只依赖进入页面时的缓存。

Worker 在新的外部调用前 MUST 重新检查项目、资源和发起人。项目已删除或权限已撤销时 MUST 停止提交。

A 项目的用户 MUST NOT 读取、检索、引用、修改或签名访问 B 项目的消息、记忆、文档、任务和资源。

## 20. Billing

首期 MUST NOT 实现订单、支付、Credits 或 Quota 账本。

诊断用的供应商用量可以记在 `generation_attempts`，但 MUST NOT 当作余额。前端估价和 Elasticsearch 聚合 MUST NOT 作为费用或余额。

启用计费前 MUST 新写 ADR。账本 MUST 放在 PostgreSQL，并用业务幂等键防止重复扣费。

详见 [ADR-010](docs/adr/010-billing-deferred.md)。

## 21. Error Handling

统一错误类型：

```text
ApplicationError
DomainError
ValidationError
AuthenticationError
AuthorizationError
NotFoundError
ConflictError
RateLimitError
ExternalServiceError
ProviderError
TimeoutError
```

业务错误 MUST 映射为明确错误码，由统一异常处理器转换。

禁止：

```python
try:
    ...
except Exception:
    pass
```

禁止吞掉异常后返回空成功。异常日志 MUST NOT 输出密钥。

## 22. Logging

使用 structlog 输出结构化日志。

业务日志 SHOULD 包含 `request_id`、`trace_id`、`user_id`、`project_id`、`task_id`、`run_id`、`generation_id` 中实际存在的字段。

默认 MUST NOT 记录原始提示词、文档正文、会话令牌、密码和供应商密钥。

## 23. Observability

健康检查 MUST 区分进程存活和依赖就绪。

SHOULD 观察：API 延迟、任务排队时间、供应商错误、Outbox 积压、索引延迟、重试失败。

首期不部署完整 APM。引入 OpenTelemetry 或指标系统时不得改变业务边界。

## 24. Security

MUST 覆盖：认证、授权、输入校验、文件校验、限流、密钥管理、SQL 注入、XSS、CSRF、SSRF、上传、签名 URL 和供应商回调验签。

Secret MUST NOT 写入仓库。配置样例不得包含真实凭据。

供应商回调 MUST 验签、限时并去重。对象桶默认私有。

## 25. Testing

后端使用 pytest。涉及事务、隔离和索引的测试 MUST 使用真实测试用 PostgreSQL 和 Elasticsearch。供应商调用使用替身。

前端使用 Vitest 与 Testing Library。核心路径“创建项目 → 对话 → 生成 → 查看结果”使用 Playwright。

首期 MUST 覆盖：

1. 跨项目读写、检索、引用和签名访问被拒绝。
2. PostgreSQL 已提交而 Elasticsearch 或 Redis 失败时，业务结果仍正确，恢复后可以重放并追平索引。
3. 重复事件、乱序事件、删除事件和重复回调不会覆盖新状态、复活已删除数据或产生重复资源。
4. 重复提交、Worker 崩溃、供应商超时和取消竞态不会产生重复外部任务或错误终态。
5. 对话断线可恢复；失败输出不会变成完整消息；失效分块不会被引用。
6. 索引可以从事实源重建，alias 切换后的结果和权限正确。

未运行的检查 MUST NOT 被写成已通过。

## 26. Deployment

开发环境用 Docker Compose 提供 PostgreSQL、Elasticsearch、Redis、MinIO、API 和 Worker。

API、Worker、Outbox Dispatcher SHOULD 可以独立启动，并共用同一镜像中的不同命令。

生产启动 MUST NOT 自动建表。数据库变更只通过 Alembic。备份 MUST 包含 PostgreSQL 和对象存储，并 SHOULD 定期验证恢复。

首期不用 Kubernetes。

## 27. Architecture Constraints

### MUST

- PostgreSQL 是 Source of Truth。
- Elasticsearch 数据必须能够重建。
- AI 供应商必须通过 Model Gateway。
- 长任务必须进入异步系统。
- 项目资源必须按 `project_id` 隔离。
- 核心业务规则必须有测试。
- 模块必须遵守依赖方向。
- 业务写入和 Outbox 必须在同一 PostgreSQL 事务中。
- 公开状态必须使用统一任务词汇。

### SHOULD

- PostgreSQL 到 Elasticsearch 的同步保持异步。
- 优先复用已有 Service、Repository 和 Gateway。
- 优先使用已经选定的成熟组件。
- 优先使用简单、显式的实现。
- 模块保持扁平文件，直到文件本身变得难以阅读。

### MUST NOT

- 把 Elasticsearch 当作主数据库或权限、余额、任务真值来源。
- Router 直接访问数据库、搜索引擎或供应商 SDK。
- Domain 依赖 SQLAlchemy、LangChain、Celery 或 HTTP 框架。
- Business Service 直接调用第三方 AI SDK。
- 用 FastAPI BackgroundTasks 执行长任务。
- 静默修改公共 API、数据库结构或任务状态机。
- 静默改变技术栈或增加重复基础设施。
- AI Agent 在未确认时修改架构。

## 28. Forbidden Patterns

- `utils.py`、`utils2.py`、`service_v2.py`、`common_new.py` 这类平行副本。
- 无范围的 `get_by_id`。
- 请求体自行指定资源所属项目。
- 双写 PostgreSQL 和 Elasticsearch。
- 用 Celery 结果或 Redis 键作为任务真值。
- 把视频生成包成 LangChain Agent。
- 模型在没有用户确认时创建生成任务或改写记忆。
- 跨项目记忆召回。
- 生产环境 `create_all`。
- 硬编码密钥。
- 捕获 `Exception` 后忽略。
- 为了少写几十行代码新增一个大型依赖。

新增 Service、Repository、Gateway、队列或框架之前，必须能说明现有结构为什么不够。不能说明就修改现有代码。

## 29. Configuration

配置 MUST 通过统一 Settings 读取环境变量，并区分 development、testing、staging、production。

业务代码 MUST NOT 到处调用 `os.getenv`。

## 30. Resolved Decisions

1. 视频状态同步：Provider 屏蔽 Polling 与 Webhook 的差异。首期默认 Polling，不为 Webhook 预建复杂基础设施。见 [ADR-011](docs/adr/011-video-status-sync.md)。
2. 知识库文件：首期实现 PDF、DOCX、TXT、Markdown。解析必须经过统一 Parser，业务代码不得按文件格式分支。后续格式通过新 Parser 接入。见 [ADR-012](docs/adr/012-document-parser.md)。
3. 成员角色：首期只有 OWNER 和 MEMBER。见 [ADR-013](docs/adr/013-project-membership-roles.md)。

仍留到对应实现阶段、且不改变当前边界的事项：首个视频、LLM 与 Embedding 供应商，文件大小上限，生成并发限额，数据保留周期。

知识库链路固定为：

```text
Upload → Parse → Normalize → Chunk → Embedding → Index → Retrieval
```

## 31. Implementation Order

初始化代码前，本文和 ADR 必须保持为当前约束。

1. 工程骨架、认证、项目权限、迁移、统一错误和日志、前端基础布局。
2. Outbox、Worker、视频适配器替身、任务状态机、对象存储和生成记录。
3. 持久对话、SSE、模型配置和真实文本供应商。
4. 文档解析、分块、异步索引、RAG 引用和索引重建。
5. 用户确认的项目记忆、隔离回归、恢复演练。

第一次实现只建立当前步骤需要的骨架，不生成未验证的完整业务功能。
