import { jsonResponse, readJson } from "../http";
import { normalizeEmail } from "../identity";
import { getSetting } from "../settings/store";
import { buildErrorTarget, buildSuccessTarget, normalizeRedirect, redirectResponse } from "./redirects";
import { createLocalEmailSession, isLocalEmailSessionRequest } from "./local-email-session";
import { upsertUserFromIdentity } from "./repository";
import { signSession } from "./session";
import { isDevRuntime } from "./types";
import type { AuthEnv } from "./types";

const TOKEN_TTL_SECONDS = 900;
const THROTTLE_TTL_SECONDS = 3600;
const THROTTLE_LIMIT = 3;

type SendLinkRequest = {
  email?: string;
  redirect?: string;
};

type MagicLinkRecord = {
  email: string;
  redirect: string;
  created_at: number;
};

export type EmailSender = (input: {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  apiKey: string;
}) => Promise<void>;

export async function handleSendLink(
  request: Request,
  env: AuthEnv,
  options: { sender?: EmailSender } = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const body = await readJson<SendLinkRequest>(request);
  const email = normalizeEmail(body.email);
  if (!email) {
    return jsonResponse({ error: "email_required" }, { status: 400 });
  }

  if (isLocalEmailSessionRequest(request, env)) {
    return jsonResponse(await createLocalEmailSession(env, email));
  }

  const redirect = await normalizeRedirect(env, body.redirect);
  const apiKey = await getSetting(env, "email.provider_api_key");
  const fromAddress = await getSetting(env, "email.from_address");
  const dev = isDevRuntime(env);

  if (!apiKey) {
    if (!dev) {
      return jsonResponse({ error: "email_provider_not_configured" }, { status: 500 });
    }
  } else if (!fromAddress) {
    return jsonResponse({ error: "email_provider_not_configured" }, { status: 500 });
  }

  if (await isThrottled(env, email)) {
    // Always claim success to avoid leaking which emails are being rate-limited.
    return jsonResponse({ ok: true, expires_in: TOKEN_TTL_SECONDS });
  }
  await incrementThrottle(env, email);

  const token = generateMagicToken();
  const hash = await sha256Hex(token);
  const record: MagicLinkRecord = {
    email,
    redirect,
    created_at: Date.now(),
  };
  await env.CONFIG.put(magicKey(hash), JSON.stringify(record), {
    expirationTtl: TOKEN_TTL_SECONDS,
  });

  const verifyUrl = buildVerifyUrl(request, token);

  if (!apiKey) {
    // dev dry-run
    return jsonResponse({ ok: true, expires_in: TOKEN_TTL_SECONDS, verify_url: verifyUrl });
  }

  const sender = options.sender ?? defaultResendSender;
  try {
    await sender({
      to: email,
      from: fromAddress!,
      subject: "Your AI Apps Box sign-in link",
      html: renderMagicLinkEmail(verifyUrl),
      text: renderMagicLinkText(verifyUrl),
      apiKey,
    });
  } catch {
    // KV row is left in place — caller can retry send-link to get a fresh token.
    return jsonResponse({ error: "email_send_failed" }, { status: 500 });
  }

  return jsonResponse({ ok: true, expires_in: TOKEN_TTL_SECONDS });
}

export async function handleVerify(request: Request, env: AuthEnv): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return redirectResponse(await buildErrorTarget(env, "invalid_magic_link"));
  }

  const hash = await sha256Hex(token);
  const stored = await env.CONFIG.get(magicKey(hash));
  if (!stored) {
    return redirectResponse(await buildErrorTarget(env, "invalid_magic_link"));
  }
  await env.CONFIG.delete(magicKey(hash));

  let record: MagicLinkRecord;
  try {
    record = JSON.parse(stored) as MagicLinkRecord;
  } catch {
    return redirectResponse(await buildErrorTarget(env, "invalid_magic_link"));
  }

  const user = await upsertUserFromIdentity(env, {
    provider: "email",
    providerSubject: record.email,
    email: record.email,
    emailVerified: true,
  });

  const session = await signSession(env, { userId: user.id, email: user.email });
  const target = await buildSuccessTarget(env, record.redirect, {
    token: session.token,
    expiresIso: session.expiresAt,
    email: session.email,
  });
  return redirectResponse(target);
}

function magicKey(hash: string): string {
  return `magic:${hash}`;
}

function throttleKey(emailHash: string): string {
  return `magic_throttle:${emailHash}`;
}

async function isThrottled(env: AuthEnv, email: string): Promise<boolean> {
  const hash = await sha256Hex(email);
  const current = await env.CONFIG.get(throttleKey(hash));
  if (!current) return false;
  const parsed = Number.parseInt(current, 10);
  return Number.isFinite(parsed) && parsed >= THROTTLE_LIMIT;
}

async function incrementThrottle(env: AuthEnv, email: string): Promise<void> {
  const hash = await sha256Hex(email);
  const current = await env.CONFIG.get(throttleKey(hash));
  const next = (current ? Number.parseInt(current, 10) || 0 : 0) + 1;
  await env.CONFIG.put(throttleKey(hash), String(next), { expirationTtl: THROTTLE_TTL_SECONDS });
}

function generateMagicToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64Url(bytes);
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

function buildVerifyUrl(request: Request, token: string): string {
  const url = new URL(request.url);
  const apiPrefix = url.pathname.startsWith("/api/") ? "/api" : "";
  return `${url.origin}${apiPrefix}/auth/email/verify?token=${encodeURIComponent(token)}`;
}

function renderMagicLinkEmail(verifyUrl: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f7f8;font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:32px 32px 12px;">
          <p style="margin:0 0 12px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0f766e;">AI Apps Box</p>
          <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;color:#111827;">Sign in or create your account</h1>
          <p style="margin:0 0 16px;font-size:16px;color:#374151;">
            Use the secure link below to continue to AI Apps Box. This sign-in link expires in 15 minutes and can only be used once.
          </p>
          <p style="margin:0 0 24px;font-size:16px;color:#374151;">
            If this is your first time using this email address, we will create your account after you confirm the link.
          </p>
          <p style="margin:0 0 24px;">
            <a href="${verifyUrl}" style="display:inline-block;padding:12px 20px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:700;">Sign in to AI Apps Box</a>
          </p>
          <p style="margin:0 0 12px;font-size:14px;color:#6b7280;">If the button does not work, copy and paste this URL into your browser:</p>
          <p style="margin:0 0 24px;font-size:14px;word-break:break-all;color:#2563eb;">${verifyUrl}</p>
          <p style="margin:0;font-size:14px;color:#6b7280;">
            If you did not request this email, you can ignore it. No changes will be made to your account.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderMagicLinkText(verifyUrl: string): string {
  return [
    "AI Apps Box",
    "",
    "Sign in or create your account.",
    "Use the secure link below to continue to AI Apps Box.",
    "This sign-in link expires in 15 minutes and can only be used once.",
    "",
    verifyUrl,
    "",
    "If this is your first time using this email address, we will create your account after you confirm the link.",
    "If you did not request this email, you can ignore it.",
  ].join("\n");
}

const defaultResendSender: EmailSender = async ({ to, from, subject, html, text, apiKey }) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });

  if (!response.ok) {
    throw new Error(`resend_request_failed:${response.status}`);
  }
};
