import { requireAdminUser } from "../../auth";
import { jsonResponse, readJson } from "../../http";
import {
  listLlmConfig,
  loadUpdatedByEmails,
  updateLlmConfig,
  type LlmConfigRow,
} from "./repo";
import { parseConfigUpdate, parseTask } from "./validation";

export async function handleListConfig(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }
  await requireAdminUser(env, request);

  const rows = await listLlmConfig(env);
  const userIds = uniqueUpdatedByIds(rows);
  const emailByUserId = await loadUpdatedByEmails(env, userIds);

  return jsonResponse({
    tasks: rows.map((row) => serializeConfig(row, emailByUserId)),
  });
}

export async function handleUpdateConfig(
  request: Request,
  env: Env,
  taskParam: string,
): Promise<Response> {
  if (request.method !== "PUT") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }
  const admin = await requireAdminUser(env, request);

  const task = parseTask(taskParam);
  if (task instanceof Response) return task;

  const body = await readJson<unknown>(request);
  const parsed = parseConfigUpdate(body);
  if (parsed instanceof Response) return parsed;

  const updated = await updateLlmConfig(env, task, {
    provider: parsed.provider,
    model: parsed.model,
    fallback_provider: parsed.fallback_provider,
    fallback_model: parsed.fallback_model,
    updated_by: admin.id,
    now: Date.now(),
  });

  if (!updated) {
    return jsonResponse({ error: "task_not_found" }, { status: 404 });
  }

  const emailByUserId = await loadUpdatedByEmails(
    env,
    updated.updated_by ? [updated.updated_by] : [],
  );
  return jsonResponse(serializeConfig(updated, emailByUserId));
}

// -----------------------------------------------------------------------------

function uniqueUpdatedByIds(rows: ReadonlyArray<LlmConfigRow>): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.updated_by) ids.add(row.updated_by);
  }
  return [...ids];
}

function serializeConfig(row: LlmConfigRow, emailByUserId: Map<string, string>) {
  return {
    task: row.task,
    provider: row.provider,
    model: row.model,
    fallback_provider: row.fallback_provider,
    fallback_model: row.fallback_model,
    updated_at: new Date(row.updated_at).toISOString(),
    updated_by: row.updated_by ? (emailByUserId.get(row.updated_by) ?? null) : null,
  };
}
