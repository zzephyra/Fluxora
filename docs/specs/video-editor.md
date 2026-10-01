# 视频编辑器契约

依据 [ADR-022](../adr/022-video-timeline-editor.md)。编辑器属于现有项目，不是独立应用。入口为生成结果的“编辑视频”；已有工程从生成页“已保存的剪辑工程”打开。

## 时间与编辑

首版固定 30 FPS，一条 video 轨道，最多 100 片段、10 分钟。所有位置使用整数帧和左闭右开区间；`duration = source_end_frame - source_start_frame`，speed 固定为 1。工程可为横屏、竖屏或方形，边长为 240–1920 的偶数。原始素材不改变；同一视频可以重复引用。删除保留空隙，空隙为黑画面和静音。

拖动与裁剪不得穿过相邻片段或源边界，最短 1 帧。吸附采用 8 像素阈值，目标为零点、播放头和其他片段端点。缩放不改变任何帧数据。分割在播放头所在片段内部进行，不在边界创建空片段。

`features/video-editor` 负责编辑页面。Remotion Player 组合逐帧预览，Zustand store 按编辑会话创建，拆分 document、UI、playback 和 history；播放、选中、缩放不进入撤销历史。手势预览可多次更新，但结束只添加一次历史。TanStack Query 负责服务端工程和导出任务；缓存键包含 project_id。编辑器通过 lazy route 加载。

连续缩略图由真实视频 + canvas 抽取，以 URL 和源帧作为缓存键；单解码器串行处理，最多缓存 160 张。只渲染可见时间线与两侧少量预加载区域，卸载取消未完成请求并释放 video。无法抽帧显示不可用，不使用装饰图片代替。

快捷键：Space 播放/暂停，左右键逐帧，Shift+左右键 10 帧，S 分割，Delete/Backspace 删除，Cmd/Ctrl+Z 撤销，Cmd/Ctrl+Shift+Z 或 Ctrl+Y 重做。输入框和对话框不拦截这些按键。裁剪手柄支持方向键，属性面板支持输入位置和源范围。

## 保存和接口

P 表示 `/api/v1/projects/{project_id}/editor`。所有接口先验证登录和项目成员；所有写操作校验 CSRF。不存在或不可访问统一 404。HTTP DTO 使用 snake_case；实际类型由 Pydantic OpenAPI 生成至前端 `src/api/schema.d.ts`。

| 路径 | 行为 |
| --- | --- |
| GET P/media | 当前项目最近 100 个 ready 视频素材；不返回对象键 |
| GET P/documents | 最近更新的 100 个工程 |
| POST P/documents | title、composition；201 创建工程 |
| GET P/documents/{id} | 查询当前工程及 version |
| PATCH P/documents/{id} | title、composition、expected_version；不匹配 409，前端保留草稿 |
| POST P/documents/{id}/renders | expected_version + Idempotency-Key；202 异步导出已保存版本 |
| GET P/documents/{id}/latest-render | 最新导出或 null，刷新后恢复任务查看 |
| GET P/renders/{id} | 真正的任务状态、失败原因及输出资产 ID |

工程只保存 asset_id，不保存 Cookie、对象键或临时 URL。PG 为唯一事实源；编辑器不需要 ES 索引。工程 JSON 下载是备份功能，不等于视频导出。当前只提供 JSON 导出，不提供 JSON 导入按钮。

## 渲染与恢复

`editor_documents` 保存版本化 composition；`editor_renders` 保存不可变快照、幂等请求摘要、操作者、状态与输出资产。相同项目/操作者/幂等键的相同请求返回原任务，不同请求 409。同工程只允许一个活动导出。导出快照不随之后的编辑变化。

运行 `python -m app.workers.editor_render`。沿用当前 PostgreSQL 领取任务的 Worker 形态；每进程一次渲染，通过 SKIP LOCKED 防止重复领取。不新增平行消息队列。任务状态为 queued/running/succeeded/failed/canceled；首版 UI 不提供尚未实现的运行中取消。

FFmpeg/ffprobe 必须在 PATH，Docker 镜像已安装。渲染执行时及提交结果前重新检查项目和用户。单源视频最多 256 MiB、工程源文件总计 512 MiB、输出 256 MiB。总执行超时 15 分钟；进程崩溃后 running 超过 20 分钟标为 failed，可由用户重新导出。失败不自动再次提交。Worker 每 2 秒扫描，queued 在 Worker 停机时仍保存在 PG。

只接受受控 asset_id，输入拷入临时目录后由参数数组启动 FFmpeg；不接受用户 URL、路径或命令。限制容器解复用格式与协议，限制单进程 FFmpeg 线程。按片段统一帧率、尺寸、音量，补黑场/静音后拼接 H.264/AAC MP4；临时文件在成功、失败与超时后清理。素材资产通过既有 generation 资产访问用例读取，输出通过其注册用例入库，不由 editor 直接查询资产表。

视频字节接口支持单区间 Range，便于浏览器定位。当前对象存储读取仍整对象加载，Range 仅在 API 响应层裁切；大规模并发应进一步实现对象存储端 Range/流式读取。对象写成功但 PG 提交失败仍可能留下不可见孤儿对象，遵循现有对象存储清理差距，不伪称已完成生产恢复体系。

## 验收

- 纯编辑测试覆盖帧换算、像素吸附、源边界、相邻片段约束、分割连续性、删除空隙、手势历史和输入隔离。
- PG/API 测试覆盖项目隔离、保存冲突、幂等重放、真实 Worker 输出与授权读取。
- 真实 FFmpeg 测试生成视频后裁剪并插入前后黑场，检查帧数与像素；不只检查文件存在。
- 浏览器手工验收使用 `tests/editor_browser_server.py` 和专用 fluxora_test 数据库。该 harness 复用实际应用、实际身份验证和渲染 Service；仅对象存储是测试替身，不在生产入口中注入。必须在 pytest 完成后单独运行，避免测试清库干扰。
- 尚未实现字幕、独立音轨、转场、变速、特效和任意视频上传；不得展示假入口。新增轨道需要同时扩展 PG 契约、Remotion 组合和 FFmpeg 渲染语义。

迁移 0010 为工程、渲染任务及资产增加项目复合外键；editor_document_assets 和 editor_render_assets 显式登记源引用，防止跨空间引用及素材被物理误删。

## 更新接口类型

在 backend 运行 `uv run python -c 'import json; from app.main import create_app; from pathlib import Path; Path("../frontend/openapi.json").write_text(json.dumps(create_app().openapi(), indent=2))'`，然后在 frontend 运行 `pnpm api:generate`。提交 OpenAPI 文档与生成类型，禁止手改 schema.d.ts。
