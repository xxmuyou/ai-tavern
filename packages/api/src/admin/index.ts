import { handleAdminCompanionArtRequest } from "./companion-art";
import { handleAdminAllowlistRequest } from "./user-allowlist";

export async function handleAdminRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const allowlistResponse = await handleAdminAllowlistRequest(request, env, pathname);
  if (allowlistResponse) return allowlistResponse;

  const companionArtResponse = await handleAdminCompanionArtRequest(request, env, pathname);
  if (companionArtResponse) return companionArtResponse;

  return null;
}
