# ADR-016: GitHub 与 Google 登录

## Status

Proposed — 2026-09-27。用户要求去掉登录页“账号由管理员创建”的说明，改为允许使用 GitHub 和 Google 账号登录。尚未确认，不改代码。

## Context

当前身份契约只允许邮箱和密码。用户由管理员命令创建，不提供公开注册、邮件找回或 OAuth。见 [API 与权限](../specs/api-and-access.md) 与 [前端规范](../specs/frontend.md) 第 7 节。会话仍是 [ADR-007](007-cookie-session-auth.md) 的 HttpOnly Cookie。

第三方登录会让首次成功的外部账号直接成为用户，这改变了“仅管理员创建用户”的边界。

## Decision

待确认后采用以下边界：

- 保留邮箱密码登录。登录页去掉管理员开通说明，增加 GitHub 与 Google 两个入口。
- 外部登录只证明身份。成功后仍签发现有 `fluxora_session`，不把供应商访问令牌写入浏览器或 localStorage。
- 身份主键是供应商主体标识，不单独信任可变邮箱。邮箱冲突时不得把已有密码账号静默并入。
- 首次成功登录可以创建用户；管理员命令仍可创建密码账号。不提供密码找回。
- 回调校验 state 与 CSRF，拒绝任意重定向。供应商密钥只存在服务端配置。

## Alternatives

- 只改登录页文案和按钮，后端仍不接入。这会把未实现的登录显示成可用。
- 用供应商令牌替换 Cookie 会话。这会绕过现有撤销和 CSRF。

## Consequences

确认后先改 ADR-007 的首期范围、`ARCHITECTURE.md` 认证节，以及 API 与前端规范，再实现回调、用户关联和登录页按钮。未确认前登录页保持现有说明。
