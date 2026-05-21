export async function recordUsage(
  env: Env,
  userId: string,
  dateUtc: string,
  messageCountDelta: number,
  costUsdDelta: number,
): Promise<void> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO usage_log (id, user_id, date_utc, message_count, event_count, llm_cost_usd, created_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(user_id, date_utc) DO UPDATE SET
       message_count = message_count + excluded.message_count,
       llm_cost_usd  = llm_cost_usd  + excluded.llm_cost_usd`,
  )
    .bind(id, userId, dateUtc, messageCountDelta, costUsdDelta, now)
    .run();
}

export function formatDateUtc(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
