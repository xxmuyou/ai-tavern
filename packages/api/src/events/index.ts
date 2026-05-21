import { requireAuthUser } from "../auth";
import { jsonResponse } from "../http";
import { listEvents } from "./list";
import { resolveEvent } from "./resolve";

export async function handleEventsRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname === "/events") {
    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const user = await requireAuthUser(env, request);
    return listEvents(request, env, user);
  }

  const resolveMatch = pathname.match(/^\/events\/([^/]+)\/resolve$/);
  if (resolveMatch) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const id = resolveMatch[1];
    if (!id) {
      return jsonResponse({ error: "invalid_event_id" }, { status: 400 });
    }
    const user = await requireAuthUser(env, request);
    return resolveEvent(request, env, user, decodeURIComponent(id));
  }

  return null;
}
