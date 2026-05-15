import type { AppRegistryEntry } from "@xtbit/shared";

import { jsonResponse } from "./http";

type AppRow = AppRegistryEntry & {
  sort_order: number;
};

export async function handleAppsRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname === "/apps" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT app_key AS appKey, name, status, sort_order
       FROM apps
       ORDER BY sort_order ASC, app_key ASC`,
    ).all<AppRow>();

    return jsonResponse({
      apps: results.map(({ appKey, name, status }) => ({ appKey, name, status })),
    });
  }

  return null;
}
