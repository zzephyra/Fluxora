import { apiRequest, ApiError } from "../../lib/api";
import { isRecord } from "../../lib/record";
import type { Project, ProjectPage, ProjectRole } from "./types";

export const projectListQueryKey = ["projects", "list"] as const;

export function projectDetailQueryKey(projectId: string) {
  return ["projects", projectId, "detail"] as const;
}

function isRole(value: unknown): value is ProjectRole {
  return value === "OWNER" || value === "MEMBER";
}

function parseProject(value: unknown): Project | null {
  if (!isRecord(value) || !isRole(value.role)) {
    return null;
  }
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.version !== "number" ||
    typeof value.created_at !== "string" ||
    typeof value.updated_at !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    role: value.role,
    version: value.version,
    created_at: value.created_at,
    updated_at: value.updated_at,
  };
}

function invalidResponse(): ApiError {
  return new ApiError({
    status: 500,
    code: "invalid_response",
    message: "响应无法识别",
    details: {},
    requestId: null,
  });
}

export async function listProjects(cursor: string | null, signal?: AbortSignal): Promise<ProjectPage> {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) {
    params.set("cursor", cursor);
  }
  const body = await apiRequest({
    path: `/api/v1/projects?${params.toString()}`,
    signal,
  });
  if (!isRecord(body) || !Array.isArray(body.items)) {
    throw invalidResponse();
  }
  const items: Project[] = [];
  for (const item of body.items) {
    const project = parseProject(item);
    if (!project) {
      throw invalidResponse();
    }
    items.push(project);
  }
  if (body.next_cursor !== null && typeof body.next_cursor !== "string") {
    throw invalidResponse();
  }
  return { items, next_cursor: body.next_cursor };
}

export async function createProject(name: string): Promise<Project> {
  const body = await apiRequest({
    path: "/api/v1/projects",
    method: "POST",
    body: { name: name.trim() },
    csrf: true,
  });
  const project = parseProject(body);
  if (!project) {
    throw invalidResponse();
  }
  return project;
}

export async function getProject(projectId: string, signal?: AbortSignal): Promise<Project> {
  const body = await apiRequest({
    path: `/api/v1/projects/${projectId}`,
    signal,
  });
  const project = parseProject(body);
  if (!project) {
    throw invalidResponse();
  }
  return project;
}
