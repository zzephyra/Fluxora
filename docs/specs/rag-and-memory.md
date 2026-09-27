# RAG、上下文与记忆

## 1. 编排边界

Chat Service 决定权限、检索模式和上下文策略；Knowledge/Memory Service 提供 PG 验证后的内容。LangChain 适配器只格式化、计算 token、处理结构化输出及调用模型，不访问业务表、不绕开 Search Gateway、不另建向量库。所有模型调用经过 Model Gateway。

## 2. 文档入库

仅接收 ready FILE Asset，支持 PDF、DOCX、UTF-8 TXT、Markdown。首期 PDF 只提取文字，不做 OCR；扫描件返回 no_extractable_text，加密 PDF 返回 encrypted_document。DOCX 禁止加载外部关系、执行宏。渲染 Markdown 必须清理危险 HTML 和 URL。

Parser 返回有序 blocks，每块含 text、locator、parser_version；PDF 页码从 1 开始，DOCX 使用段落序号，文本使用行范围。当前仅 text 的端口必须在真实解析器接入前扩展。校验文件特征/容器结构，不只校验扩展名。

默认分块目标 600 token、重叠 80、上限 900，按配置 embedding tokenizer 实测，禁止按字数假称 token。保留跨页定位范围。默认上限：200 万字符、500 页、5000 分块、解析 120 秒；DOCX 解压总大小不超过 100 MiB。

原文、分块、来源版本保存在 PG，按顺序可恢复规范化文本。整版分块完成前不发布；embedding 失败只影响 index_status，不重复解析。新版本成为 current_version 后旧版不再用于新检索，新版未就绪明确 processing；历史引用可定位旧版，但文档删除后禁止返回正文。整版有效分块可搜索后才将 index_status 记为 succeeded。

## 3. 召回策略

默认只规范化查询空白，不做 LLM 改写。授权项目内 BM25 top 30 + 向量 top 30，RRF(k=60) 合并、去重、PG 校验后最多取 8 块。不足时最多补取一次。首期关闭额外 reranker；启用时必须固定模型、预算和评测。

记忆独立召回最多 5 条 active 修订。排名分数不是事实可信度。失效命中不能进入模型上下文或客户端。

| rag_mode | 无资料/命中 | 部分资料处理中 | 检索依赖故障 |
| --- | --- | --- | --- |
| off | 普通对话 | 不检索 | 不调用检索 |
| auto | 明确无项目证据，可一般回答 | 用就绪资料并提示不完整 | retrieval_unavailable，不能静默降级 |
| required | 返回持久化“资料不足”答复，不调用模型 | 有命中则带不完整提示，无命中同左 | retrieval_unavailable |

off 不自动召回记忆，但可以注入用户显式选择的 memory_ids（PG 校验）；auto/required 自动召回。required 的资料不足是成功的确定性答复，retrieval_status=no_evidence。retrieval_status 其余取值 disabled/ready/partial/unavailable。

## 4. 上下文和引用

模型配置必须定义 context_window、max_output_tokens 和 tokenizer。默认输出预留 min(2048, 模型 max_output_tokens) token，安全余量为窗口的 5%。系统提示词与当前输入不可静默截断，超窗返回 context_too_large。其余输入预算：记忆最多 15%、分块最多 45%、历史/摘要最多 40%；未用额度先补最近历史，再补检索。

指令优先级：系统规则 > 当前明确要求 > 已确认记忆 > 资料/历史。优先级不允许篡改事实，事实冲突应并列来源。历史只取当前 conversation，保留最近完整轮次；摘要持久化覆盖 sequence、模型/模板版本，不能替代原始消息或自动成为记忆。摘要失败可退回最近轮次并明确裁剪。

context_manifest 保存模型、模板和检索配置版本、chunk/记忆修订 ID、内容哈希、token 计数。只允许引用本次候选；模型编造引用必须去掉并记录 warning。引用包含 document_id、document_version_id、chunk_id、locator，不生成虚假页码。

最终发布前再次校验归属、版本和删除；已变化则失败 context_changed 或移除不再使用的引用，不能发布失效证据。撤权时关闭流，已经送达设备的内容无法承诺撤回。

## 5. 记忆生命周期

类型 character/style/world/constraint/preference/fact。模型建议仅是聊天候选；用户保存才创建业务记忆。创建写 active revision 与 Outbox；编辑同事务将旧 revision 置 superseded、插入新 active、递增 memory.version；删除记墓碑。恢复旧内容创建新 revision，不修改历史。

消息/文档来源必须校验项目归属。源删除后保留已确认记忆，返回 source_unavailable=true；记忆内容本身是 PG 独立事实，用户可以删除。主题冲突不自动覆盖，让用户选择保留或编辑。每条最多 4000 字符；不能将用户记忆直接升级为系统指令。

## 6. 验收

固定测试集覆盖精确词、同义词、无答案、同名跨项目、版本替换、删除、恶意指令、扫描 PDF、错误引用、记忆冲突。断言引用来自授权候选并可定位，不要求模型措辞完全一致。修改 embedding/chunker/召回配置必须保存前后命中率和失败样例，未经评测不能切生产索引。
