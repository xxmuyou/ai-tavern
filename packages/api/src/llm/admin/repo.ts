import type { LLMProvider, LLMTask } from "../types";

export type LlmConfigRow = {
  task: LLMTask;
  provider: LLMProvider;
  model: string;
  fallback_provider: LLMProvider | null;
  fallback_model: string | null;
  updated_at: number;
  updated_by: string | null;
};

export type LlmConfigUpdate = {
  provider: LLMProvider;
  model: string;
  fallback_provider: LLMProvider | null;
  fallback_model: string | null;
  updated_by: string;
  now: number;
};

export async function listLlmConfig(env: Env): Promise<LlmConfigRow[]> {
  const result = await env.DB.prepare(
    `SELECT task, provider, model, fallback_provider, fallback_model, updated_at, updated_by
     FROM llm_config
     ORDER BY task ASC`,
  ).all<LlmConfigRow>();
  return result.results;
}

export async function getLlmConfig(env: Env, task: LLMTask): Promise<LlmConfigRow | null> {
  const row = await env.DB.prepare(
    `SELECT task, provider, model, fallback_provider, fallback_model, updated_at, updated_by
     FROM llm_config
     WHERE task = ?`,
  )
    .bind(task)
    .first<LlmConfigRow>();
  return row ?? null;
}

/**
 * Updates an existing llm_config row. Returns null if the task doesn't exist;
 * caller maps that to a 404. We don't INSERT new tasks here — task names are
 * bound to code constants and adding one means a code change, not a DB change.
 */
export async function updateLlmConfig(
  env: Env,
  task: LLMTask,
  input: LlmConfigUpdate,
): Promise<LlmConfigRow | null> {
  const result = await env.DB.prepare(
    `UPDATE llm_config
        SET provider = ?,
            model = ?,
            fallback_provider = ?,
            fallback_model = ?,
            updated_at = ?,
            updated_by = ?
      WHERE task = ?`,
  )
    .bind(
      input.provider,
      input.model,
      input.fallback_provider,
      input.fallback_model,
      input.now,
      input.updated_by,
      task,
    )
    .run();

  if (result.meta.changes === 0) {
    return null;
  }
  return getLlmConfig(env, task);
}

/**
 * Resolve `updated_by` user_id to email by joining users. Returned as a Map
 * so the handler can stitch emails into the listLlmConfig response without
 * an N+1 query.
 */
export async function loadUpdatedByEmails(
  env: Env,
  userIds: ReadonlyArray<string>,
): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map();
  }
  const placeholders = userIds.map(() => "?").join(",");
  const result = await env.DB.prepare(
    `SELECT id, email FROM users WHERE id IN (${placeholders})`,
  )
    .bind(...userIds)
    .all<{ id: string; email: string }>();
  return new Map(result.results.map((row) => [row.id, row.email]));
}

// -----------------------------------------------------------------------------
// Usage aggregation
// -----------------------------------------------------------------------------

export type UsageWindow = "today" | "7d" | "30d";

export type UsageRange = {
  fromMs: number;
  toMs: number;
};

export type UsageTotals = {
  calls: number;
  token_input: number;
  token_output: number;
  cost_usd: number;
  error_calls: number;
};

export type UsageByTaskProvider = UsageTotals & {
  task: LLMTask;
  provider: LLMProvider;
};

export type UsageSummary = {
  totals: UsageTotals;
  byTaskProvider: UsageByTaskProvider[];
};

export function rangeForWindow(window: UsageWindow, now: number = Date.now()): UsageRange {
  if (window === "today") {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    return { fromMs: start.getTime(), toMs: now };
  }
  const days = window === "7d" ? 7 : 30;
  return { fromMs: now - days * 24 * 60 * 60 * 1000, toMs: now };
}

const TOTALS_SQL = `
  SELECT
    COUNT(*)                                                AS calls,
    COALESCE(SUM(token_input), 0)                           AS token_input,
    COALESCE(SUM(token_output), 0)                          AS token_output,
    COALESCE(SUM(cost_usd), 0)                              AS cost_usd,
    SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)       AS error_calls
  FROM llm_logs
  WHERE created_at >= ? AND created_at < ?
`;

const BY_TASK_PROVIDER_SQL = `
  SELECT
    task, provider,
    COUNT(*)                                                AS calls,
    COALESCE(SUM(token_input), 0)                           AS token_input,
    COALESCE(SUM(token_output), 0)                          AS token_output,
    COALESCE(SUM(cost_usd), 0)                              AS cost_usd,
    SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)       AS error_calls
  FROM llm_logs
  WHERE created_at >= ? AND created_at < ?
  GROUP BY task, provider
  ORDER BY cost_usd DESC
`;

export async function summarizeLlmLogs(env: Env, range: UsageRange): Promise<UsageSummary> {
  const totalsRow = await env.DB.prepare(TOTALS_SQL)
    .bind(range.fromMs, range.toMs)
    .first<RawTotalsRow>();
  const byRows = await env.DB.prepare(BY_TASK_PROVIDER_SQL)
    .bind(range.fromMs, range.toMs)
    .all<RawByTaskProviderRow>();

  return {
    totals: normalizeTotals(totalsRow),
    byTaskProvider: byRows.results.map(normalizeByTaskProvider),
  };
}

type RawTotalsRow = {
  calls: number;
  token_input: number;
  token_output: number;
  cost_usd: number;
  error_calls: number | null;
};

type RawByTaskProviderRow = RawTotalsRow & {
  task: LLMTask;
  provider: LLMProvider;
};

function normalizeTotals(row: RawTotalsRow | null): UsageTotals {
  if (!row) {
    return { calls: 0, token_input: 0, token_output: 0, cost_usd: 0, error_calls: 0 };
  }
  return {
    calls: row.calls ?? 0,
    token_input: row.token_input ?? 0,
    token_output: row.token_output ?? 0,
    cost_usd: row.cost_usd ?? 0,
    error_calls: row.error_calls ?? 0,
  };
}

function normalizeByTaskProvider(row: RawByTaskProviderRow): UsageByTaskProvider {
  return {
    task: row.task,
    provider: row.provider,
    calls: row.calls ?? 0,
    token_input: row.token_input ?? 0,
    token_output: row.token_output ?? 0,
    cost_usd: row.cost_usd ?? 0,
    error_calls: row.error_calls ?? 0,
  };
}
