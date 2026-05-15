import { jsonResponse, readJson } from "../http";
import { ensureUserByEmail, normalizeEmail } from "../identity";
import { getAdminRouteConfig, isAdminEmail, updateAdminRouteConfig } from "./index";

type AdminConfigRequest = {
  email?: string;
  providerModels?: Record<string, string>;
  providerOrder?: string[];
  routeKey?: string;
};

export async function handleLlmAdminRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (!pathname.startsWith("/admin/llm")) {
    return null;
  }

  if (pathname === "/admin/llm/config" && request.method === "GET") {
    const url = new URL(request.url);
    requireAdminEmail(url.searchParams.get("email"));
    return jsonResponse(await getAdminRouteConfig(env, url.searchParams.get("routeKey") ?? undefined));
  }

  if (pathname === "/admin/llm/config" && request.method === "PUT") {
    const body = await readJson<AdminConfigRequest>(request);
    const email = requireAdminEmail(body.email);
    const user = await ensureUserByEmail(env, email);
    const config = await updateAdminRouteConfig(env, {
      providerModels: body.providerModels,
      providerOrder: body.providerOrder,
      routeKey: body.routeKey,
      updatedBy: user,
    });
    return jsonResponse(config);
  }

  return jsonResponse({ error: "not_found" }, { status: 404 });
}

function requireAdminEmail(value: string | null | undefined): string {
  const email = normalizeEmail(value);
  if (!email || !isAdminEmail(email)) {
    throw new Response("admin_required", { status: 403 });
  }

  return email;
}
