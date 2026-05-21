import { requireAdminUser } from "../../auth";
import { jsonResponse, readJson } from "../../http";
import { invokeProvider } from "../router";
import { LLMError, type LLMProvider, type LLMRequest, type LLMResponse, type LLMTask } from "../types";
import { getLlmConfig } from "./repo";
import { parseTestCallBody } from "./validation";

/**
 * Direct invoker used by the test endpoint. Injected via deps so tests can
 * substitute a fake without hitting a real provider.
 */
export type ProviderInvoker = (
  env: Env,
  request: LLMRequest,
  target: { provider: LLMProvider; model: string },
) => Promise<LLMResponse>;

export type TestCallDeps = {
  invoke?: ProviderInvoker;
  now?: () => number;
};

export async function handleTestCall(
  request: Request,
  env: Env,
  deps: TestCallDeps = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }
  await requireAdminUser(env, request);

  const body = await readJson<unknown>(request);
  const parsed = parseTestCallBody(body);
  if (parsed instanceof Response) return parsed;

  const target = await resolveTarget(env, parsed.task, parsed.override);
  if (target instanceof Response) return target;

  const invoke = deps.invoke ?? invokeProvider;
  const now = deps.now ?? Date.now;
  const llmRequest: LLMRequest = {
    task: parsed.task,
    messages: [{ role: "user", content: parsed.prompt }],
  };

  const start = now();
  try {
    const response = await invoke(env, llmRequest, target);
    return jsonResponse({
      ok: true,
      text: response.text,
      provider: response.provider,
      model: response.model,
      tokens: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
      cost_usd: response.cost_usd,
      latency_ms: response.latency_ms,
    });
  } catch (err) {
    const latency_ms = now() - start;
    const { error_code, error_message } = describeError(err);
    return jsonResponse({
      ok: false,
      provider: target.provider,
      model: target.model,
      error_code,
      error_message,
      latency_ms,
    });
  }
}

async function resolveTarget(
  env: Env,
  task: LLMTask,
  override: { provider: LLMProvider; model: string } | null,
): Promise<{ provider: LLMProvider; model: string } | Response> {
  if (override) {
    return override;
  }
  const config = await getLlmConfig(env, task);
  if (!config) {
    return jsonResponse({ error: "task_not_found" }, { status: 404 });
  }
  return { provider: config.provider, model: config.model };
}

function describeError(err: unknown): { error_code: string; error_message: string } {
  if (err instanceof LLMError) {
    return { error_code: err.code, error_message: err.message };
  }
  if (err instanceof Error) {
    return { error_code: "provider_request_failed", error_message: err.message };
  }
  return { error_code: "provider_request_failed", error_message: String(err) };
}
