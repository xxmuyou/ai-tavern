import { retiredResponse } from "../companions/emotion-art-routes";
import { jsonResponse } from "../http";

export async function handleAdminCompanionArtRequest(
  request: Request,
  _env: Env,
  pathname: string,
): Promise<Response | null> {
  const match = pathname.match(
    /^\/admin\/companions\/([^/]+)\/emotion-art\/prewarm$/,
  );
  if (!match) return null;

  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  return retiredResponse();
}
