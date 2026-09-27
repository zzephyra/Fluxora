# 前端实现与交互规范

## 1. 页面结构

应用 Shell：顶部项目切换与账户菜单，左侧项目导航，右侧主内容区。宽屏导航 240px，主区最小宽度 0；小于 768px 改为抽屉，不为窄屏创建第二套业务页面。项目列表不展示项目内导航。

| 路由 | 页面职责 | 主要动作 |
| --- | --- | --- |
| /login | 登录表单 | 登录、展示统一失败信息 |
| /projects | 项目列表 | 创建、进入项目 |
| /projects/:projectId | 工作台 | 最近任务、资料处理状态、进入创作 |
| /projects/:projectId/chat/:conversationId? | 会话列表与消息流 | 新会话、发送、引用详情、保存记忆候选 |
| /projects/:projectId/knowledge | 文档列表与入库状态 | 上传、更新版本、查看失败、重试 |
| /projects/:projectId/memory | 记忆卡片/列表 | 确认新增、编辑、修订历史、删除 |
| /projects/:projectId/generation | 生成表单与任务列表 | 选模型、参数、参考图、提交、取消 |
| /projects/:projectId/generation/:taskId | 任务详情 | 真实状态、输出预览、下载、重新生成 |
| /projects/:projectId/assets | 资源库 | 分类、预览、下载、删除 |
| /projects/:projectId/settings | 名称与成员 | OWNER 管理，MEMBER 只读 |

功能未实现时显示明确的未开放状态，不用演示成功数据冒充真实结果。路由缺少/失效 projectId 时回到项目列表，不能自动读取上次项目缓存。

## 2. 视觉与组件

首期中性浅色主题，深色模式延后。token 在单一样式入口定义：背景 #F8FAFC，面板 #FFFFFF，正文 #0F172A，次级文字 #475569，边框 #CBD5E1，主色 #1D4ED8，危险色 #B91C1C，成功色 #166534。状态必须同时有文字/图标，不只靠颜色。

使用系统 sans-serif 字体；正文 14px/1.5，页面标题 24px，区块标题 18px，辅助文字 12px。间距采用 4/8/12/16/24/32px，控件默认高 40px、圆角 8px，卡片圆角 12px。功能页不得单独硬编码另一套颜色或间距；token 变更在全局完成。

通用组件至少包括 Button、Input、Textarea、Select、Dialog、AlertDialog、Tabs、Badge、Table、Skeleton；业务共享组件为 TaskStatus、EmptyState、ErrorState、AssetPreview、CitationLink，放在所属 feature 的公开导出中。禁止平行重写同名组件。

输入有 label，错误文本绑定 aria-describedby；对话框管理焦点并支持 Esc；破坏性按钮使用 AlertDialog。图标按钮有 aria-label。Markdown 不开启不受控原生 HTML，外链校验协议并隔离新窗口。

## 3. 代码组织

feature 内以 components、hooks、api.ts、types.ts（仅 UI 类型）按需组织；禁止提前创建空层级。React 组件 PascalCase，hooks useXxx，其他变量 camelCase；API DTO 保留 snake_case。跨 feature 只经公开 index.ts 导出，禁止 import 另一 feature 私有文件。

所有网络调用在统一 api 客户端完成：Cookie、CSRF、request_id、超时、AbortSignal、标准错误转换。生成 OpenAPI 类型不能保证运行时安全；对 SSE/未知外部结构使用显式类型守卫，不能用 as 强制断言跳过校验。生成器在前端初始化时选定并锁定，不手改生成代码。

Query key 统一为 ["projects",projectId,resource,...filters]，全局 auth/model 查询独立命名。项目切换取消请求和 SSE、清理页面临时输入；未提交草稿先提示是否离开。401 清空全部缓存并跳转登录；项目 404 清理对应缓存，防止继续显示已撤权内容。

不默认乐观更新任务、记忆版本或成员权限。成功后按服务端响应更新或 invalidate；409 展示冲突并保留用户草稿，不能自动覆盖最新内容。

## 4. 关键交互

生成表单根据 capability 渲染参数；模型切换清除不兼容参数并提示。提交前展示最终提示词、模型与参数、参考资源，由用户点击生成。幂等键在一次提交意图开始时生成，网络重试复用；用户编辑后再次提交使用新键。

任务列表默认 3 秒轮询，页面隐藏时降至 15 秒，终态停止；429 按 Retry-After，网络错误退避。用 allowed_actions 决定按钮，但仍处理后端拒绝。cancel_requested 显示“正在请求取消”，reconciliation_required 显示“结果待核对”，不能提供会造成重复收费的自动重试。

SSE 按事件 ID 去重，snapshot 替换而不是追加；completed 后拉取最终消息。断线提示“连接中断，正在恢复”，不自动重新发送消息。失败 partial 文本与完整回答视觉区分。

文档同时展示解析和索引状态；记忆保存有明确确认动作。引用打开对应资料页/段落；已删除来源只显示不可用提示。下载 URL 临近过期重新向后端申请，不长期缓存签名链接。

## 5. 前端验收

用一个真实 feature 页面作为后续参考，不建立另一个演示应用。各页面覆盖 loading/empty/error/success、401/404/409、窄屏和键盘访问。端到端测试覆盖切换项目时旧请求迟到、重复点击生成、SSE 重连、记忆并发编辑、取消未确认、资料索引失败。通过 build/typecheck 不能代替这些业务验证。
