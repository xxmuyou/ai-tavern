import { requireAuthUser } from "../auth";
import { isProUser } from "../billing/entitlements";
import type { BillingTier } from "../billing/types";
import { jsonResponse, readJson } from "../http";
import { createCreditsCheckout } from "./checkout";
import { ensureMonthlyGrant } from "./grants";
import { getCreditBalance, listLedger } from "./ledger";
import { CreditsError, type CreditLedgerRow, type CreditsEnv } from "./types";

export async function handleCreditsRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (!pathname.startsWith("/credits")) {
    return null;
  }

  if (pathname === "/credits/balance") {
    return guard(() => handleBalance(request, env));
  }
  if (pathname === "/credits/ledger") {
    return guard(() => handleLedger(request, env));
  }
  if (pathname === "/credits/checkout") {
    return guard(() => handleCheckout(request, env));
  }

  return jsonResponse({ error: "not_found" }, { status: 404 });
}

async function handleBalance(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed();
  }
  const user = await requireAuthUser(env, request);
  const tier: BillingTier = (await isProUser(env, user.id)) ? "pro" : "free";
  const monthlyGrant = await ensureMonthlyGrant(env, user.id, tier);
  const balance = await getCreditBalance(env, user.id);

  return jsonResponse({
    available_credits: balance.available_credits,
    monthly_grant: monthlyGrant,
    reserved_credits: balance.reserved_credits,
  });
}

async function handleLedger(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed();
  }
  const user = await requireAuthUser(env, request);
  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "");
  const entries = await listLedger(env, user.id, {
    beforeId: url.searchParams.get("before_id"),
    limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
  });

  return jsonResponse({ entries: entries.map(serializeLedger) });
}

async function handleCheckout(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed();
  }
  const user = await requireAuthUser(env, request);
  const body = await readJson<{ package?: unknown }>(request);
  const checkoutUrl = await createCreditsCheckout(env as CreditsEnv, user, body?.package);
  return jsonResponse({ checkout_url: checkoutUrl });
}

async function guard(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof CreditsError) {
      return jsonResponse({ error: err.code }, { status: err.status });
    }
    throw err;
  }
}

function methodNotAllowed(): Response {
  return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
}

function serializeLedger(row: CreditLedgerRow): Record<string, unknown> {
  return {
    amount: row.amount,
    balance_after: row.balance_after,
    created_at: row.created_at,
    expires_at: row.expires_at,
    id: row.id,
    metadata: parseMetadata(row.metadata),
    reference_id: row.reference_id,
    reference_type: row.reference_type,
    reserved_after: row.reserved_after,
    task_type: row.task_type,
    type: row.type,
  };
}

function parseMetadata(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export {
  commitReservation,
  getCreditBalance,
  refundCredits,
  releaseReservation,
  reserveCredits,
} from "./ledger";
export { ensureMonthlyGrant } from "./grants";
export { handleCreditsCheckoutCompleted, isCreditsCheckoutSession } from "./webhooks";
export { TASK_CREDIT_COST } from "./pricing";
export { CreditsError } from "./types";
