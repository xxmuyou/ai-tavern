import { handleDevLoginAllowlistRequest } from "./dev-login-allowlist";

export async function handleAdminRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  return handleDevLoginAllowlistRequest(request, env, pathname);
}

export { isDevLoginEmailAllowed } from "./dev-login-allowlist";
