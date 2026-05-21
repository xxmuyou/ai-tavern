import { jsonResponse } from "../http";
import { getOAuthProvider } from "./providers";
import type { OAuthExchangeResult, OAuthProvider, ProviderResolver } from "./providers";
import {
  buildErrorTarget,
  buildSuccessTarget,
  normalizeRedirect,
  redirectResponse,
} from "./redirects";
import { upsertUserFromIdentity } from "./repository";
import { signSession } from "./session";
import type { AuthEnv } from "./types";

const STATE_TTL_SECONDS = 600;

type StateRecord = {
  provider: string;
  redirect: string;
  created_at: number;
};

export async function handleOAuthStart(
  request: Request,
  env: AuthEnv,
  providerId: string,
  resolveProvider: ProviderResolver = getOAuthProvider,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  let provider: OAuthProvider;
  try {
    provider = resolveProvider(env, providerId);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    throw error;
  }

  const url = new URL(request.url);
  const rawRedirect = url.searchParams.get("redirect");
  const redirect = normalizeRedirect(env, rawRedirect);

  const state = crypto.randomUUID();
  const stateRecord: StateRecord = {
    provider: provider.id,
    redirect,
    created_at: Date.now(),
  };

  await env.CONFIG.put(stateKey(state), JSON.stringify(stateRecord), {
    expirationTtl: STATE_TTL_SECONDS,
  });

  const target = provider.buildAuthorizationUrl({
    state,
    redirectUri: buildProviderRedirectUri(request, providerId),
  });
  return redirectResponse(target);
}

export async function handleOAuthCallback(
  request: Request,
  env: AuthEnv,
  providerId: string,
  resolveProvider: ProviderResolver = getOAuthProvider,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  // Provider resolution is checked first — Apple / unknown providers
  // short-circuit to the unified error redirect.
  let provider: OAuthProvider;
  try {
    provider = resolveProvider(env, providerId);
  } catch (error) {
    if (error instanceof Response) {
      const code = await extractErrorCode(error);
      return redirectResponse(buildErrorTarget(env, code));
    }
    throw error;
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return redirectResponse(buildErrorTarget(env, "invalid_oauth_state"));
  }

  const stateRaw = await env.CONFIG.get(stateKey(state));
  if (!stateRaw) {
    return redirectResponse(buildErrorTarget(env, "invalid_oauth_state"));
  }
  await env.CONFIG.delete(stateKey(state));

  let stateRecord: StateRecord;
  try {
    stateRecord = JSON.parse(stateRaw) as StateRecord;
  } catch {
    return redirectResponse(buildErrorTarget(env, "invalid_oauth_state"));
  }

  if (stateRecord.provider !== provider.id) {
    return redirectResponse(buildErrorTarget(env, "invalid_oauth_state"));
  }

  let exchange: OAuthExchangeResult;
  try {
    exchange = await provider.exchangeCode({
      code,
      redirectUri: buildProviderRedirectUri(request, providerId),
    });
  } catch {
    return redirectResponse(buildErrorTarget(env, "invalid_oauth_token"));
  }

  if (!exchange.emailVerified) {
    return redirectResponse(buildErrorTarget(env, "email_unverified"));
  }

  const user = await upsertUserFromIdentity(env, {
    provider: provider.id,
    providerSubject: exchange.providerSubject,
    email: exchange.email,
    emailVerified: exchange.emailVerified,
    displayName: exchange.displayName,
  });

  const session = await signSession(env, { userId: user.id, email: user.email });

  const target = buildSuccessTarget(env, stateRecord.redirect, {
    token: session.token,
    expiresIso: session.expiresAt,
    email: session.email,
  });
  return redirectResponse(target);
}

function stateKey(state: string): string {
  return `oauth:state:${state}`;
}

function buildProviderRedirectUri(request: Request, providerId: string): string {
  // Use the incoming request URL to determine our callback origin.
  // The actual path is always /auth/oidc/{provider}/callback (worker normalizes /api/*).
  const url = new URL(request.url);
  url.pathname = `/auth/oidc/${providerId}/callback`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function extractErrorCode(response: Response): Promise<string> {
  try {
    const body = (await response.clone().json()) as { error?: string };
    return body.error ?? "provider_not_configured";
  } catch {
    return "provider_not_configured";
  }
}
