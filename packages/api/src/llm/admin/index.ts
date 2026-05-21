import { handleListConfig, handleUpdateConfig } from "./config";
import { handleTestCall, type TestCallDeps } from "./test";
import { handleUsage, type UsageDeps } from "./usage";

export type AdminLlmDeps = TestCallDeps & UsageDeps;

/**
 * Routes /admin/llm/* requests. Returns null if the pathname doesn't match,
 * so the worker can fall through to other handlers.
 *
 * Sub-handlers call `requireAdminUser` which throws a Response (401/403) on
 * auth failure. We catch that here so direct callers (tests, future RPC) get
 * a Response value instead of a rejected promise.
 */
export async function handleAdminLlmRequest(
  request: Request,
  env: Env,
  pathname: string,
  deps: AdminLlmDeps = {},
): Promise<Response | null> {
  const handler = resolveHandler(pathname, deps);
  if (!handler) return null;

  try {
    return await handler(request, env);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}

function resolveHandler(
  pathname: string,
  deps: AdminLlmDeps,
): ((request: Request, env: Env) => Promise<Response>) | null {
  if (pathname === "/admin/llm/config") {
    return (request, env) => handleListConfig(request, env);
  }

  const configMatch = pathname.match(/^\/admin\/llm\/config\/([^/]+)$/);
  if (configMatch) {
    const task = configMatch[1]!;
    return (request, env) => handleUpdateConfig(request, env, task);
  }

  if (pathname === "/admin/llm/test") {
    const testDeps: TestCallDeps = { invoke: deps.invoke, now: deps.now };
    return (request, env) => handleTestCall(request, env, testDeps);
  }

  if (pathname === "/admin/llm/usage") {
    const usageDeps: UsageDeps = { now: deps.now };
    return (request, env) => handleUsage(request, env, usageDeps);
  }

  return null;
}

export { handleListConfig, handleTestCall, handleUpdateConfig, handleUsage };
export type { ProviderInvoker } from "./test";
