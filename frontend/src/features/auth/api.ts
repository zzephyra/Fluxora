import { apiRequest, ApiError } from "../../lib/api";
import { isRecord } from "../../lib/record";
import type { UserIdentity } from "./types";

export const sessionQueryKey = ["auth", "session"] as const;

function parseUser(value: unknown): UserIdentity | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.id !== "string" || typeof value.email !== "string") {
    return null;
  }
  if (typeof value.platform_admin !== "boolean") {
    return null;
  }
  return { id: value.id, email: value.email, platform_admin: value.platform_admin };
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

export async function getMe(signal?: AbortSignal): Promise<UserIdentity> {
  const body = await apiRequest({
    path: "/api/v1/auth/me",
    signal,
    unauthorized: "throw",
  });
  const user = parseUser(body);
  if (!user) {
    throw invalidResponse();
  }
  return user;
}

export async function login(email: string, password: string): Promise<UserIdentity> {
  await apiRequest({
    path: "/api/v1/auth/csrf",
    unauthorized: "throw",
  });
  const body = await apiRequest({
    path: "/api/v1/auth/login",
    method: "POST",
    body: { email: email.trim(), password },
    csrf: true,
    unauthorized: "throw",
  });
  if (!isRecord(body)) {
    throw invalidResponse();
  }
  const user = parseUser(body.user);
  if (!user) {
    throw invalidResponse();
  }
  return user;
}

export async function logout(): Promise<void> {
  await apiRequest({
    path: "/api/v1/auth/logout",
    method: "POST",
    csrf: true,
  });
}
