export type MessageRow = {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  scene_id: string | null;
  activity_id: string | null;
  variants: string | null;
  selected_variant: number | null;
  created_at: number;
};

/**
 * The full list of wordings a message holds. A message stored before variants
 * existed (variants = NULL) is treated as a single-variant list of its content.
 */
export function parseVariants(raw: string | null, fallback: string): string[] {
  if (!raw) return [fallback];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((x) => typeof x === "string")) {
      return parsed as string[];
    }
  } catch {
    // fall through to fallback
  }
  return [fallback];
}

export async function loadMessageRow(
  env: Env,
  threadId: string,
  messageId: string,
): Promise<MessageRow | null> {
  return env.DB.prepare(
    `SELECT id, thread_id, role, content, scene_id, activity_id, variants, selected_variant, created_at
     FROM messages
     WHERE id = ? AND thread_id = ?`,
  )
    .bind(messageId, threadId)
    .first<MessageRow>();
}
