# Lumi 品牌规范

产品：Lumi。公司：Lumisene。关系：Lumi by Lumisene。官网：https://lumisene.com。

主标语：Imagine it. Lumi brings it to life. 中文：想象，即刻成真。
日常工作台、模型管理与编辑器使用产品名；Footer、公司介绍、版权与 SEO 使用公司名。

前端品牌配置在 `frontend/src/brand.ts`；Logo 在 `components/brand/LumiLogo.tsx`，支持 icon、wordmark、full。抽象 L 光带以 currentColor 显示，支持单色与现有主题。原设计 token 与功能导航保留。

`VITE_SITE_URL` 控制构建时 canonical / OpenGraph / Structured Data，默认官方域名，不更改开发服务、API 或 OAuth 回调。部署时在前端构建环境设置。

## 兼容性保留项

- 仓库路径、Git remote、Compose 项目名、数据库账号及库名。
- fluxora_session / fluxora_csrf 等认证 Cookie、密码 dummy hash 标签。
- 对象存储 bucket / key、缓存键、历史迁移、测试数据库与历史用户文件名。
- 后端 Python distribution `fluxora-backend` 及 uv lock，避免破坏现有安装与部署。
- 历史 ADR 中的品牌名保留为决策记录，不属于运行时展示。

TODO：上述持久化标识仅在单独的兼容迁移方案下修改，不使用全局字符串替换。

产品不新增虚构的企业地址、法律承诺或未实现的模块。品牌升级不代表新增生成能力。
