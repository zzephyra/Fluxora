# 异步任务、事件与恢复

## 1. 视频任务状态转移

下表列出所有允许的外部状态转移；未列出的转移一律拒绝。终态重复观察是幂等 no-op。内部重试不改变公开状态，不允许 failed 回到 running。

| 当前状态 | 事件/条件 | 下一状态 | 必需处理 |
| --- | --- | --- | --- |
| queued | Worker 获得有效租约并通过权限/参数检查 | submitting | 冻结请求快照，登记 submit attempt |
| queued | 用户取消或执行前权限失效 | canceled | 不提交供应商 |
| queued | 确定性的配置/输入错误 | failed | 记录明确错误 |
| submitting | 供应商确认接收，远端 ID 已落库 | running | 安排下一次 poll |
| submitting | 确定拒绝且无远端任务 | failed | 保存拒绝信息 |
| submitting | 超时，无法判定是否接收 | submitting | reconciliation_required=true，禁止重新 submit |
| submitting | 收到取消请求 | cancel_requested | 先查清是否已提交，不能直接宣称取消 |
| running | 输出已复制、验证且 ready Asset 已落库 | succeeded | 同事务关联输出和写终态 |
| running | 供应商明确失败，或输出保存重试耗尽 | failed | 区分 provider_failed 与 output_persist_failed |
| running | 取消请求且供应商支持取消 | cancel_requested | 异步发送 cancel |
| running | 供应商确认自行取消 | canceled | 保存远端观察 |
| cancel_requested | 确認远端取消，或明确从未提交 | canceled | 结束任务 |
| cancel_requested | 远端已完成且输出持久化完成 | succeeded | 接受完成与取消的竞态 |
| cancel_requested | 远端明确失败/输出保存耗尽 | failed | 不无限等待取消确认 |

submitting 的恢复查询发现远端已完成，先记 running 再完成输出持久化；这两步可以在同一最终 PG 事务记录状态变化。远端已接收但立即失败，同样先确认接收再记 failed。

running 不支持取消时接口返回 409 cancellation_unsupported，状态保持 running。submitting 的取消意图先记录；若后来确认供应商不支持取消，保持 cancel_requested 并标记 cancel_unavailable，继续观察至真实终态。不得退回 running 或假报 canceled。

查询/取消/结果下载超时不是供应商任务失败的证据。超过监控期限设置 reconciliation_required=true 并报警，停止自动付费动作，继续按恢复策略查询。管理员恢复命令仅通过 Service 验证远端证据，写审计记录；无法判定时保持未决，不能凭超时虚构终态。

任务 progress 为 0–100 或 null，只有供应商提供可靠进度才填数值。可额外提供 phase=submitting/generating/storing/reconciling，phase 不替代 status。

## 2. 其他长任务

chat_run 与文档入库任务：queued → running → succeeded/failed/canceled；queued 可直接 failed/canceled。首期不公开运行中 chat 的取消 API。主动中断页面只断开 SSE。文档删除后的入库作业丢弃未发布结果并 canceled。

document_version 的 ingestion_status 使用上述基础状态；index_status 使用相同词汇，但两者是独立阶段，解析成功后才可开始索引。索引失败不回退解析状态。重试创建新的内部执行 attempt，不改写已失败 attempt；聚合 index_status 可反映新一次执行，由 index_revision 区分。

## 3. 租约与执行模型

PG 记录 lease_owner、lease_token（单调递增 fencing token）、lease_expires_at、heartbeat_at、next_poll_at。领取使用行锁与 SKIP LOCKED 或等效条件更新。默认租约 60 秒、心跳 15 秒。任何结果提交都必须验证 token；旧 Worker 的迟到结果不能覆盖新 Worker。

租约只能防止重复本地落库，不能保证外部调用 exactly-once。每个远端逻辑提交使用持久化 provider_request_key；先保存调用意图再调用。供应商支持幂等时复用该键；不支持时，submit 结果不明必须核对，禁止重发。不能因 fencing 失效就再次收费。

视频轮询采用一次短任务查询、在 PG 写 next_poll_at 的方式，禁止 Worker sleep 数分钟。默认间隔 5 秒，逐步退避到 30 秒并抖动；遵守供应商 Retry-After。恢复调度器每 30 秒扫描到期任务。

Celery 使用 prefork 执行模式；异步 Service 的事件循环和 async engine 生命周期必须一致。首期每次 Celery 执行在受控 asyncio.run 中创建/关闭任务级 UoW 工厂及 engine，不复用跨循环/跨 fork 的 asyncpg 连接。确认性能瓶颈后再通过 ADR 调整。API 使用自身进程级 engine。

## 4. Outbox 与消费完成

事件名使用 entity.action.v1，如 generation.requested.v1、document.version_created.v1、memory.updated.v1、project.deleted.v1。任务创建与事件同事务。payload 只携带恢复所需的 ID、版本和非敏感元数据，不复制原文或密钥。消费者根据当前 PG 事实读取数据，跳过旧版本。

Dispatcher 领取 event_deliveries，发送 event_id/consumer/target_generation 至队列。broker 接受仅表示 dispatched，不等于 completed。每个消费者分别记录 pending/dispatched/processing/completed/failed，并保存租约、重试时间和错误。长时间 dispatched 或失效 processing 必须重投；只有消费者持久确认完成才能 completed。

ES 写入成功但 PG 标记失败时会重复执行，因此 ES 文档 ID 和业务版本必须稳定。失败重试默认 1 秒指数退避到 300 秒、带抖动，最多 8 次；耗尽写 failed 并告警。人工重放重置 delivery 调度，保留历史错误，不能重写事件事实。

删除采用永久可重建的 PG 墓碑及 ES 带版本的 deleted 文档（查询强制 deleted=false）。不得依赖搜索引擎短期保留的删除版本抵御任意迟到事件。文档版本更新需清理旧 chunk ID，并在回查时立即拒绝旧版本。

## 5. 重建与对账

禁止把自增 ID 的 MAX 当作可靠提交水位：事务可能先分配 ID、后提交，造成漏回放。

初版重建使用 PG 注册的重建目标与写入屏障：所有可索引业务写事务获取同一个共享事务 advisory lock；创建/切换重建目标获取对应排他锁。注册 target 后释放排他锁，所有新事件生成旧/新目标 delivery；在注册后的 PG 一致性快照分批构建新索引，保存游标。历史未消费事件按当前 PG 事实投影到新目标，避免历史载荷覆盖新数据。

快照写入和事件写入均使用聚合版本保护；删除墓碑也纳入构建。验证文档数、有效版本、项目过滤、抽样文本哈希和召回。切换时短暂取得排他写入屏障，等待此前所有新目标 delivery 完成（失败或超时则释放屏障并中止切换），原子切换 read alias，更新 PG 活跃目标。ES 与 PG 不做分布式事务：切换崩溃后恢复器检查实际 alias 与 build 记录进行幂等收敛；未收敛前禁止新一轮切换。

屏障只在注册与切换的短窗口阻塞索引相关写入，不能在完整重建期间锁住业务。旧索引保留 24 小时且继续同步，确保可回滚；停止同步后不得直接切回旧索引。

默认每小时对账近期更新，每日批量全量核对 ID/版本/删除标记。权限变化后查询立即以 PG 为准，不能等待对账恢复隔离。

## 6. 撤权和删除后的后台处理

撤权禁止新 submit、文本生成和 embedding。已发出的远端任务由系统恢复身份执行状态查询、尽力取消、结果清理，这类收尾不以被撤销用户的成员身份阻断。项目已删除时不再向用户发布新资产；已付费结果按清理策略处理并记录真实终态。系统恢复身份只能操作已存在任务，不能创建新的生成请求。

## 7. 重建协议实施约束

写入屏障只约束可改变搜索源内容的 PG 业务事务；delivery 完成标记、租约续期和索引派生状态更新不得再次获取共享屏障，否则切换等待会死锁。全局锁键固定且集中管理，所有源写入路径包括删除和清理必须参与，禁止只有 HTTP 写入参与。

一致性快照在首次构建时由只读 REPEATABLE READ 事务维持；连接丢失后不能声称原快照可继续。恢复时创建新快照从头重新扫描目标，依赖稳定 ID、单调版本和墓碑使重扫幂等；仅在同一有效快照内使用游标续扫。大规模构建需要更高级快照策略时另作 ADR。切换排他屏障默认最多 5 秒，追平不及则中止并重试，不无限阻塞业务。

项目删除不得绕过每条源记录的删除投影：清理 Worker 在 PG 建立版本化墓碑并生成事件；期间 PG 已禁止访问，即使 ES 暂存旧分块也不能泄露。墓碑在索引重建时保留，物理移除前必须确认所有保留事件和旧索引已越过该删除版本。
