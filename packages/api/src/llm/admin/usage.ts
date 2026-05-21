import { requireAdminUser } from "../../auth";
import { jsonResponse } from "../../http";
import { rangeForWindow, summarizeLlmLogs } from "./repo";
import { parseWindow } from "./validation";

export type UsageDeps = {
  now?: () => number;
};

export async function handleUsage(
  request: Request,
  env: Env,
  deps: UsageDeps = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }
  await requireAdminUser(env, request);

  const url = new URL(request.url);
  const window = parseWindow(url.searchParams.get("window"));
  if (window instanceof Response) return window;

  const now = (deps.now ?? Date.now)();
  const range = rangeForWindow(window, now);
  const summary = await summarizeLlmLogs(env, range);

  return jsonResponse({
    window,
    from: new Date(range.fromMs).toISOString(),
    to: new Date(range.toMs).toISOString(),
    totals: summary.totals,
    by_task_provider: summary.byTaskProvider,
  });
}
