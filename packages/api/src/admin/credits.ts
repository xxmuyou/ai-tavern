import { requireAdminUser } from "../auth/guards";
import { isProUser } from "../billing/entitlements";
import { adjustCredits, getCreditBalance, listLedger } from "../credits/ledger";
import { CreditsError, type CreditLedgerRow } from "../credits/types";
import { jsonResponse, readJson } from "../http";
import { findUserById } from "../identity";

const SEARCH_LIMIT = 20;
const LEDGER_LIMIT = 20;

export async function handleAdminCreditsRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname === "/admin/users") {
    return guard(() =>
      request.method === "GET" ? handleSearch(request, env) : methodNotAllowed(),
    );
  }

  const adjustMatch = pathname.match(/^\/admin\/users\/([^/]+)\/credits\/adjustment$/);
  if (adjustMatch) {
    const userId = decodeURIComponent(adjustMatch[1]!);
    return guard(() =>
      request.method === "POST" ? handleAdjust(request, env, userId) : methodNotAllowed(),
    );
  }

  const creditsMatch = pathname.match(/^\/admin\/users\/([^/]+)\/credits$/);
  if (creditsMatch) {
    const userId = decodeURIComponent(creditsMatch[1]!);
    return guard(() =>
      request.method === "GET" ? handleUserCredits(request, env, userId) : methodNotAllowed(),
    );
  }

  return null;
}

async function handleSearch(request: Request, env: Env): Promise<Response> {
  await requireAdminUser(env, request);

  const url = new URL(request.url);
  const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
  if (!search) {
    return jsonResponse({ error: "search_required" }, { status: 400 });
  }

  const { results } = await env.DB.prepare(
    `SELECT id, email FROM users
     WHERE email = ? OR email LIKE ? ESCAPE '\\'
     ORDER BY email ASC
     LIMIT ?`,
  )
    .bind(search, `${escapeLike(search)}%`, SEARCH_LIMIT)
    .all<{ id: string; email: string }>();

  const rows = results ?? [];
  const users = await Promise.all(
    rows.map(async (row) => ({
      email: row.email,
      tier: (await isProUser(env, row.id)) ? "pro" : "free",
      user_id: row.id,
    })),
  );

  return jsonResponse({ users });
}

async function handleUserCredits(request: Request, env: Env, userId: string): Promise<Response> {
  await requireAdminUser(env, request);

  const user = await findUserById(env, userId);
  if (!user) {
    return jsonResponse({ error: "user_not_found" }, { status: 404 });
  }

  const balance = await getCreditBalance(env, userId);
  const ledger = await listLedger(env, userId, { limit: LEDGER_LIMIT });

  return jsonResponse({
    available_credits: balance.available_credits,
    recent_ledger: ledger.map(serializeLedgerEntry),
    reserved_credits: balance.reserved_credits,
    user_id: userId,
  });
}

async function handleAdjust(request: Request, env: Env, userId: string): Promise<Response> {
  const admin = await requireAdminUser(env, request);

  const user = await findUserById(env, userId);
  if (!user) {
    return jsonResponse({ error: "user_not_found" }, { status: 404 });
  }

  const body = await readJson<{ amount?: unknown; reason?: unknown }>(request);

  const amount = body?.amount;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
    return jsonResponse({ error: "invalid_amount" }, { status: 400 });
  }

  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return jsonResponse({ error: "reason_required" }, { status: 400 });
  }

  const { balance_after, entry } = await adjustCredits(env, {
    adminId: admin.id,
    amount,
    reason,
    userId,
  });

  return jsonResponse({
    available_credits: balance_after,
    entry: serializeLedgerEntry(entry),
    user_id: userId,
  });
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

function methodNotAllowed(): Promise<Response> {
  return Promise.resolve(jsonResponse({ error: "method_not_allowed" }, { status: 405 }));
}

function serializeLedgerEntry(row: CreditLedgerRow): Record<string, unknown> {
  return {
    amount: row.amount,
    balance_after: row.balance_after,
    created_at: new Date(row.created_at).toISOString(),
    id: row.id,
    reason: extractReason(row.metadata),
    type: row.type,
  };
}

function extractReason(metadata: string | null): string | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as { reason?: unknown };
    return typeof parsed?.reason === "string" ? parsed.reason : null;
  } catch {
    return null;
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
