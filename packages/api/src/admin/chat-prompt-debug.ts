import { requireAdminUser } from "../auth";
import { jsonResponse } from "../http";
import { loadLatestPromptDebugSnapshot } from "../chat/memory";

export async function handleAdminChatPromptDebugRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const match = pathname.match(/^\/admin\/chat\/([^/]+)\/prompt-debug\/latest$/);
  if (!match) return null;

  if (request.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  await requireAdminUser(env, request);

  const threadId = decodeURIComponent(match[1] ?? "");
  if (!threadId) {
    return jsonResponse({ error: "invalid_thread_id" }, { status: 400 });
  }

  const snapshot = await loadLatestPromptDebugSnapshot(env, threadId);
  if (!snapshot) {
    return jsonResponse({ error: "prompt_debug_not_found" }, { status: 404 });
  }

  return jsonResponse({ snapshot });
}
