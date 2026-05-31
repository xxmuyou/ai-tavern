import { createRemoteJWKSet, jwtVerify } from "jose";

import { getSetting } from "../settings/store";
import { authError } from "./types";
import type { AuthEnv } from "./types";

export type OAuthExchangeResult = {
  providerSubject: string;
  email: string;
  emailVerified: boolean;
  displayName?: string | null;
};

export type OAuthProvider = {
  id: "google" | "apple";
  buildAuthorizationUrl(input: { state: string; redirectUri: string }): URL;
  exchangeCode(input: { code: string; redirectUri: string }): Promise<OAuthExchangeResult>;
};

export type ProviderResolver = (env: AuthEnv, providerId: string) => OAuthProvider | Promise<OAuthProvider>;

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export async function getOAuthProvider(env: AuthEnv, providerId: string): Promise<OAuthProvider> {
  if (providerId === "google") {
    const clientId = await getSetting(env, "auth.google_client_id");
    const clientSecret = await getSetting(env, "auth.google_client_secret");
    if (!clientId || !clientSecret) {
      throw authError("provider_not_configured", 400);
    }
    return googleProvider({ clientId, clientSecret });
  }
  if (providerId === "apple") {
    // v1: Apple is contract-only. Fields are reserved in env but no implementation.
    throw authError("provider_not_configured", 400);
  }
  throw authError("unknown_provider", 400);
}

export function googleProvider(args: { clientId: string; clientSecret: string }): OAuthProvider {
  const { clientId, clientSecret } = args;
  return {
    id: "google",
    buildAuthorizationUrl({ state, redirectUri }) {
      const url = new URL(GOOGLE_AUTHORIZE_URL);
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", "openid email profile");
      url.searchParams.set("state", state);
      url.searchParams.set("access_type", "online");
      url.searchParams.set("prompt", "select_account");
      return url;
    },
    async exchangeCode({ code, redirectUri }) {
      const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }).toString(),
      });

      if (!tokenResponse.ok) {
        throw new Error(`google_token_exchange_failed:${tokenResponse.status}`);
      }

      const body = (await tokenResponse.json()) as { id_token?: string };
      if (!body.id_token) {
        throw new Error("google_token_response_missing_id_token");
      }

      const jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
      const { payload } = await jwtVerify(body.id_token, jwks, {
        issuer: GOOGLE_ISSUERS,
        audience: clientId,
      });

      const sub = typeof payload.sub === "string" ? payload.sub : undefined;
      const email = typeof payload.email === "string" ? payload.email : undefined;
      const emailVerified =
        typeof payload.email_verified === "boolean" ? payload.email_verified : false;
      const name = typeof payload.name === "string" ? payload.name : null;

      if (!sub || !email) {
        throw new Error("google_id_token_missing_sub_or_email");
      }

      return {
        providerSubject: sub,
        email,
        emailVerified,
        displayName: name,
      };
    },
  };
}
