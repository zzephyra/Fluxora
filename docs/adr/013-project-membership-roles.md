# ADR-013: 项目成员角色

## Status

Accepted

## Context

项目需要区分所有者和普通参与者。完整的角色权限系统可以表达管理员、编辑者和只读者，但首期没有对应的产品规则，提前做策略引擎会把每次授权都变成配置问题。

## Decision

首期项目成员只有：

```text
OWNER
MEMBER
```

OWNER 管理项目和成员。MEMBER 可以在项目内编辑内容并提交生成。不实现 Role、Permission、Resource、Policy。

持久化时把角色保存为单一字段，供以后扩展取值。不把 owner、editor、viewer 拆成多组布尔列。ADMIN、EDITOR、VIEWER 和细粒度权限必须另写 ADR 后再实现。

本决定取代 ADR-007 中关于 owner、editor、viewer 的角色描述。认证方式仍以 ADR-007 为准。

## Alternatives

- 首期实现 OWNER、EDITOR、VIEWER。
- 直接引入通用 RBAC。
- 只用“是否创建者”布尔值表示权限。

## Trade-offs

两种角色无法表达只读成员。布尔值更少一个字段，但以后增加角色时要改表和所有判断。通用 RBAC 能覆盖未来协作，却会在没有权限矩阵时引入策略、资源和审计模型。

## Consequences

授权检查只区分 OWNER 和 MEMBER，以及非成员。非成员不能访问项目资源。邀请、审批和只读链接不在首期实现。

## Migration

成员表尚未创建。建表时使用单一角色字段。

具体操作矩阵、唯一 OWNER 和成员管理边界见 [API 与权限](../specs/api-and-access.md)。
