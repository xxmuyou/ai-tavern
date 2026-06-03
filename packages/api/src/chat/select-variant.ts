import { jsonResponse, notFound, readJson } from "../http";
import type { UserRecord } from "../identity";
import { canChatWithCompanion, loadCompanionForChat, loadThread } from "./loaders";
import { loadMessageRow, parseVariants } from "./variants";

type SelectBody = { index?: unknown };

/**
 * Pick which stored variant of a companion message is the "live" one. The chosen
 * variant's text becomes the message content, so it is what future prompt context
 * and history reads see. Relationship signals are not touched.
 */
export async function handleSelectVariant(
  request: Request,
  env: Env,
  user: UserRecord,
  companionId: string,
  messageId: string,
): Promise<Response> {
  const companion = await loadCompanionForChat(env, companionId);
  if (!companion || !canChatWithCompanion(companion, user)) {
    return notFound();
  }

  const thread = await loadThread(env, user.id, companionId);
  if (!thread) {
    return notFound();
  }

  const target = await loadMessageRow(env, thread.id, messageId);
  if (!target || target.role !== "companion") {
    return notFound();
  }

  let body: SelectBody;
  try {
    body = await readJson<SelectBody>(request);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonResponse({ error: "invalid_request" }, { status: 400 });
  }

  const variants = parseVariants(target.variants, target.content);
  const index = typeof body.index === "number" ? body.index : Number.NaN;
  if (!Number.isInteger(index) || index < 0 || index >= variants.length) {
    return jsonResponse({ error: "invalid_index", count: variants.length }, { status: 400 });
  }

  const content = variants[index] ?? target.content;
  await env.DB.prepare(`UPDATE messages SET content = ?, selected_variant = ? WHERE id = ?`)
    .bind(content, index, messageId)
    .run();

  return jsonResponse({ content, id: messageId, selected_variant: index, variants });
}
