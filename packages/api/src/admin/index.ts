import { handleAdminAllowlistRequest } from "./user-allowlist";

export async function handleAdminRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  return handleAdminAllowlistRequest(request, env, pathname);
}
