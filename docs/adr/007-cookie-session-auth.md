# ADR-007: Cookie 会话认证

## Status

Accepted

## Context

首期客户端是自家 React SPA。认证要能撤销，并且不能把“已登录”当成“可以访问任意项目”。

## Decision

浏览器使用 HttpOnly、Secure、SameSite 会话 Cookie。服务端会话和撤销状态保存在 PostgreSQL。变更状态的请求校验 CSRF。CORS 使用明确来源白名单，禁止携带凭据并允许任意来源。

认证只证明用户身份。授权在每个项目请求上重新检查 `project_members`。首期角色以 [ADR-013](013-project-membership-roles.md) 为准，只有 OWNER 和 MEMBER。

Worker 在调用外部供应商前重新检查项目、资源和发起人是否仍然有效。

首期不实现开放平台的 Bearer token。

## Alternatives

- 把 JWT 放在 localStorage 或内存中。
- 每次请求只验证签名、不保存服务端会话。
- 同时实现 Cookie 和 API token。

## Trade-offs

Cookie 会话需要 CSRF 保护，并且不适合第三方 API。JWT 容易做无状态请求，但撤销和 XSS 暴露面更差。两套认证会在首期把权限测试加倍。

## Consequences

登录接口建立会话，登出和撤销使会话失效。前端请求库统一携带 Cookie，不自行保存访问令牌。项目权限变化后，已有页面缓存不能继续显示旧项目数据。

## Migration

项目尚未实现，无迁移。
