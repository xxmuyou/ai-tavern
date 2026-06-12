import { requireAuthUser } from "../auth";
import { jsonResponse } from "../http";
import { handleDeleteHistory, handleGetHistory } from "./history";
import { handlePostMessage } from "./messages";
import { handleEditMessage } from "./edit";
import { handleRegenerateMessage } from "./regenerate";
import { handleSelectVariant } from "./select-variant";
import { handleMessageVoice } from "./voice";
import { handleGetVoiceSettings, handlePatchVoiceSettings } from "./voice-settings";

export async function handleChatRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  pathname: string,
): Promise<Response | null> {
  const regenerateMatch = pathname.match(/^\/chat\/([^/]+)\/messages\/([^/]+)\/regenerate$/);
  if (regenerateMatch) {
    const companionId = decodeURIComponent(regenerateMatch[1] ?? "");
    const messageId = decodeURIComponent(regenerateMatch[2] ?? "");
    if (!companionId || !messageId) {
      return jsonResponse({ error: "invalid_request" }, { status: 400 });
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const user = await requireAuthUser(env, request);
    return handleRegenerateMessage(request, env, ctx, user, companionId, messageId);
  }

  const editMatch = pathname.match(/^\/chat\/([^/]+)\/messages\/([^/]+)\/edit$/);
  if (editMatch) {
    const companionId = decodeURIComponent(editMatch[1] ?? "");
    const messageId = decodeURIComponent(editMatch[2] ?? "");
    if (!companionId || !messageId) {
      return jsonResponse({ error: "invalid_request" }, { status: 400 });
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const user = await requireAuthUser(env, request);
    return handleEditMessage(request, env, ctx, user, companionId, messageId);
  }

  const voiceMatch = pathname.match(/^\/chat\/([^/]+)\/messages\/([^/]+)\/voice$/);
  if (voiceMatch) {
    const companionId = decodeURIComponent(voiceMatch[1] ?? "");
    const messageId = decodeURIComponent(voiceMatch[2] ?? "");
    if (!companionId || !messageId) {
      return jsonResponse({ error: "invalid_request" }, { status: 400 });
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const user = await requireAuthUser(env, request);
    return handleMessageVoice(request, env, user, companionId, messageId);
  }

  const voiceSettingsMatch = pathname.match(/^\/chat\/([^/]+)\/voice-settings$/);
  if (voiceSettingsMatch) {
    const companionId = decodeURIComponent(voiceSettingsMatch[1] ?? "");
    if (!companionId) {
      return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
    }
    const user = await requireAuthUser(env, request);
    if (request.method === "GET") {
      return handleGetVoiceSettings(env, user, companionId);
    }
    if (request.method === "PATCH") {
      return handlePatchVoiceSettings(request, env, user, companionId);
    }
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const variantMatch = pathname.match(/^\/chat\/([^/]+)\/messages\/([^/]+)\/variant$/);
  if (variantMatch) {
    const companionId = decodeURIComponent(variantMatch[1] ?? "");
    const messageId = decodeURIComponent(variantMatch[2] ?? "");
    if (!companionId || !messageId) {
      return jsonResponse({ error: "invalid_request" }, { status: 400 });
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const user = await requireAuthUser(env, request);
    return handleSelectVariant(request, env, user, companionId, messageId);
  }

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
