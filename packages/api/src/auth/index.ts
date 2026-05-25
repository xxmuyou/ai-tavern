import { handleSendLink, handleVerify } from "./email-link";
import { handleLogout, handleMe, handleMePreferences } from "./me";
import { handleOAuthCallback, handleOAuthStart } from "./oauth";
import type { AuthEnv } from "./types";

export {
  isAdminEmail,
  isAdminUser,
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
  if (pathname === "/auth/me") {
    return handleMe(request, env as AuthEnv);
  }

  if (pathname === "/auth/me/preferences") {
    return handleMePreferences(request, env as AuthEnv);
  }

  if (pathname === "/auth/logout") {
    return handleLogout(request, env as AuthEnv);
  }

  if (pathname === "/auth/email/send-link") {
    return handleSendLink(request, env as AuthEnv);
  }

  if (pathname === "/auth/email/verify") {
    return handleVerify(request, env as AuthEnv);
  }

  const oidcStartMatch = pathname.match(/^\/auth\/oidc\/([^/]+)\/start$/);
  if (oidcStartMatch) {
    return handleOAuthStart(request, env as AuthEnv, oidcStartMatch[1]!);
  }

  const oidcCallbackMatch = pathname.match(/^\/auth\/oidc\/([^/]+)\/callback$/);
  if (oidcCallbackMatch) {
    return handleOAuthCallback(request, env as AuthEnv, oidcCallbackMatch[1]!);
  }

  return null;
}
