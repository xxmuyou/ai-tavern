import { handleDevSession } from "./dev-session";

export {
  isAdminEmail,
  optionalAuthEmail,
  optionalAuthUser,
  requireAdminEmail,
  requireAdminUser,
  requireAuthEmail,
  requireAuthUser,
} from "./guards";
export { isDevRuntime } from "./types";
export type { AuthEnv, AuthPayload, IdentityProvider } from "./types";

export async function handleAuthRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname === "/auth/dev-session") {
    return handleDevSession(request, env);
  }

  return null;
}
