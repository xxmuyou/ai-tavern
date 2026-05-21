import { requireAuthUser } from "../auth";
import { jsonResponse } from "../http";
import { handleDeleteHistory, handleGetHistory } from "./history";
import { handlePostMessage } from "./messages";

export async function handleChatRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  pathname: string,
): Promise<Response | null> {
  const messagesMatch = pathname.match(/^\/chat\/([^/]+)\/messages$/);
  if (messagesMatch) {
    const companionId = decodeURIComponent(messagesMatch[1] ?? "");
    if (!companionId) {
      return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const user = await requireAuthUser(env, request);
    return handlePostMessage(request, env, ctx, user, companionId);
  }

  const historyMatch = pathname.match(/^\/chat\/([^/]+)\/history$/);
  if (historyMatch) {
    const companionId = decodeURIComponent(historyMatch[1] ?? "");
    if (!companionId) {
      return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
    }
    const user = await requireAuthUser(env, request);

    if (request.method === "GET") {
      return handleGetHistory(env, user, companionId, new URL(request.url));
    }
    if (request.method === "DELETE") {
      return handleDeleteHistory(env, user, companionId);
    }
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  return null;
}
