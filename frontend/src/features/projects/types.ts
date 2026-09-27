export const PROJECT_NAME_MAX_LENGTH = 120;

export type ProjectRole = "OWNER" | "MEMBER";

export type Project = {
  id: string;
  name: string;
  role: ProjectRole;
  version: number;
  created_at: string;
  updated_at: string;
};

export type ProjectPage = {
  items: Project[];
  next_cursor: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isProjectId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function validateProjectName(value: string): string | null {
  const name = value.trim();
  if (name.length < 1) {
    return "请输入项目名称";
  }
  if (name.length > PROJECT_NAME_MAX_LENGTH) {
    return "项目名称不能超过 120 个字符";
  }
  return null;
}

export function roleLabel(role: ProjectRole): string {
  return role === "OWNER" ? "所有者" : "成员";
}

export function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "更新时间未知";
  }
  return `更新于 ${new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)}`;
}
