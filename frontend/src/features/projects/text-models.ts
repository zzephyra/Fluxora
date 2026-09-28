import { apiRequest, ApiError, isApiError } from "../../lib/api";
import { isRecord } from "../../lib/record";

export type TextModel = {
  id: string;
  provider: string;
  model_name: string;
  capability: string;
};

export type TextCompletion = {
  id: string;
  status: string;
  content: string | null;
  error: { code: string; message: string } | null;
};

function invalidResponse(): ApiError {
  return new ApiError({
    status: 500,
    code: "invalid_response",
    message: "响应无法识别",
    details: {},
    requestId: null,
  });
}

function parseModel(value: unknown): TextModel | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.id !== "string" ||
    typeof value.provider !== "string" ||
    typeof value.model_name !== "string" ||
    value.capability !== "text_generation"
  ) {
    return null;
  }
  return {
    id: value.id,
    provider: value.provider,
    model_name: value.model_name,
    capability: value.capability,
  };
}

function parseCompletion(value: unknown): TextCompletion | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.status !== "string") {
    return null;
  }
  const content = typeof value.content === "string" ? value.content : null;
  let error: TextCompletion["error"] = null;
  if (
    isRecord(value.error) &&
    typeof value.error.code === "string" &&
    typeof value.error.message === "string"
  ) {
    error = { code: value.error.code, message: value.error.message };
  }
  return { id: value.id, status: value.status, content, error };
}

export async function getActiveTextModel(
  projectId: string,
  signal?: AbortSignal,
): Promise<TextModel | null> {
  try {
    const body = await apiRequest({
      path: `/api/v1/projects/${projectId}/active-model?capability=text_generation`,
      signal,
    });
    return parseModel(body);
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function submitTextCompletion(
  projectId: string,
  prompt: string,
): Promise<TextCompletion> {
  const body = await apiRequest({
    path: `/api/v1/projects/${projectId}/text-completions`,
    method: "POST",
    body: { prompt },
    csrf: true,
  });
  const completion = parseCompletion(body);
  if (!completion) {
    throw invalidResponse();
  }
  return completion;
}

export async function getTextCompletion(
  projectId: string,
  completionId: string,
  signal?: AbortSignal,
): Promise<TextCompletion> {
  const body = await apiRequest({
    path: `/api/v1/projects/${projectId}/text-completions/${completionId}`,
    signal,
  });
  const completion = parseCompletion(body);
  if (!completion) {
    throw invalidResponse();
  }
  return completion;
}
