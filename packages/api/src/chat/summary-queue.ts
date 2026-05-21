const HISTORY_WINDOW = 50;
const ENQUEUE_INTERVAL = 10;

export type SummaryJobPayload = {
  type: "chat.summary";
  thread_id: string;
  message_count: number;
  created_at: string;
};

/**
 * Fire a summary job once a thread crosses the recent-message window
 * (every {@link ENQUEUE_INTERVAL} new messages past the window).
 *
 * The consumer is intentionally a stub — see spec-006 §summary-queue.
 */
export async function maybeEnqueueSummary(
  env: Env,
  threadId: string,
  messageCount: number,
): Promise<void> {
  if (messageCount <= HISTORY_WINDOW) return;
  if ((messageCount - HISTORY_WINDOW) % ENQUEUE_INTERVAL !== 0) return;

  const payload: SummaryJobPayload = {
    created_at: new Date().toISOString(),
    message_count: messageCount,
    thread_id: threadId,
    type: "chat.summary",
  };

  await env.JOB_QUEUE.send(payload);
}

export const SUMMARY_QUEUE_CONFIG = {
  ENQUEUE_INTERVAL,
  HISTORY_WINDOW,
} as const;
