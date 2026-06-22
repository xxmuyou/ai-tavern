import { requireAuthUser } from "../auth";
import { isProUser } from "../billing/entitlements";
import type { BillingTier } from "../billing/types";
import { jsonResponse, readJson } from "../http";
import { createCreditsCheckout } from "./checkout";
import { ensureMonthlyGrant, ensureSignupGrant } from "./grants";
import {
  getCreditBalance,
  listLedger,
  listLedgerRowsByIds,
  listSettlementsByReservationIds,
} from "./ledger";
import {
  CreditsError,
  type CreditActivityEntry,
  type CreditLedgerRow,
  type CreditsEnv,
} from "./types";

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
  await ensureSignupGrant(env, user.id);
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
  const activities = await buildCreditActivities(env, user.id, entries);

  return jsonResponse({ activities, entries: entries.map(serializeLedger) });
}

async function handleCheckout(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed();
  }
  const user = await requireAuthUser(env, request);
  const body = await readJson<{ analytics?: unknown; package?: unknown }>(request);
  const checkoutUrl = await createCreditsCheckout(env as CreditsEnv, user, body?.package, body.analytics);
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

async function buildCreditActivities(
  env: Env,
  userId: string,
  entries: CreditLedgerRow[],
): Promise<CreditActivityEntry[]> {
  const entryIds = new Set(entries.map((entry) => entry.id));
  const reserveIds = new Set<string>();
  const reservesById = new Map<string, CreditLedgerRow>();
  const settlementsByReserveId = new Map<string, CreditLedgerRow>();

  for (const entry of entries) {
    if (entry.type === "reserve") {
      reserveIds.add(entry.id);
      reservesById.set(entry.id, entry);
      continue;
    }
    if (isReservationSettlement(entry)) {
      reserveIds.add(entry.reference_id);
      settlementsByReserveId.set(entry.reference_id, entry);
    }
  }

  const missingReserveIds = [...reserveIds].filter((id) => !reservesById.has(id));
  for (const row of await listLedgerRowsByIds(env, userId, missingReserveIds)) {
    if (row.type === "reserve") {
      reservesById.set(row.id, row);
    }
  }

  const reserveIdsMissingSettlements = [...reserveIds].filter((id) => !settlementsByReserveId.has(id));
  for (const row of await listSettlementsByReservationIds(env, userId, reserveIdsMissingSettlements)) {
    if (isReservationSettlement(row)) {
      settlementsByReserveId.set(row.reference_id, row);
    }
  }

  const usedSettlementIds = new Set<string>();
  const activities: CreditActivityEntry[] = [];
  for (const entry of entries) {
    if (isReservationSettlement(entry)) {
      const reserve = reservesById.get(entry.reference_id);
      if (!reserve || usedSettlementIds.has(entry.id)) continue;
      activities.push(settlementActivity(entry, reserve));
      usedSettlementIds.add(entry.id);
      continue;
    }

    if (entry.type === "reserve") {
      const settlement = settlementsByReserveId.get(entry.id);
      if (settlement) {
        // The final, user-facing activity belongs to the settlement row. If it
        // is not in this raw page, it appeared in a newer page and should not
        // be duplicated here.
        if (entryIds.has(settlement.id) && !usedSettlementIds.has(settlement.id)) {
          activities.push(settlementActivity(settlement, entry));
          usedSettlementIds.add(settlement.id);
        }
        continue;
      }
      activities.push({
        amount: entry.amount,
        created_at: entry.created_at,
        id: entry.id,
        task_type: entry.task_type,
        title: `Pending · ${taskLabel(entry.task_type)}`,
        type: "pending",
      });
      continue;
    }

    const directActivity = directLedgerActivity(entry);
    if (directActivity) activities.push(directActivity);
  }

  return activities;
}

function isReservationSettlement(
  entry: CreditLedgerRow,
): entry is CreditLedgerRow & { reference_id: string; reference_type: "reservation"; type: "commit" | "release" } {
  return (
    (entry.type === "commit" || entry.type === "release") &&
    entry.reference_type === "reservation" &&
    typeof entry.reference_id === "string" &&
    entry.reference_id.length > 0
  );
}

function settlementActivity(settlement: CreditLedgerRow, reserve: CreditLedgerRow): CreditActivityEntry {
  if (settlement.type === "release") {
    return {
      amount: settlement.amount > 0 ? settlement.amount : Math.abs(reserve.amount),
      created_at: settlement.created_at,
      id: settlement.id,
      task_type: reserve.task_type,
      title: `Released · ${taskLabel(reserve.task_type)}`,
      type: "released",
    };
  }

  return {
    amount: reserve.amount,
    created_at: settlement.created_at,
    id: settlement.id,
    task_type: reserve.task_type,
    title: `Spent · ${taskLabel(reserve.task_type)}`,
    type: "spent",
  };
}

function directLedgerActivity(entry: CreditLedgerRow): CreditActivityEntry | null {
  switch (entry.type) {
    case "purchase":
      return {
        amount: entry.amount,
        created_at: entry.created_at,
        id: entry.id,
        task_type: entry.task_type,
        title: "Credit purchase",
        type: "credit_purchase",
      };
    case "grant_monthly": {
      const signup = entry.reference_type === "signup_grant";
      return {
        amount: entry.amount,
        created_at: entry.created_at,
        id: entry.id,
        task_type: entry.task_type,
        title: signup ? "Signup credits" : "Monthly credits",
        type: signup ? "signup_credits" : "monthly_credits",
      };
    }
    case "refund":
      return {
        amount: entry.amount,
        created_at: entry.created_at,
        id: entry.id,
        task_type: entry.task_type,
        title: "Refund",
        type: "refund",
      };
    case "adjustment":
      return {
        amount: entry.amount,
        created_at: entry.created_at,
        id: entry.id,
        task_type: entry.task_type,
        title: "Adjustment",
        type: "adjustment",
      };
    case "expire":
      return {
        amount: entry.amount,
        created_at: entry.created_at,
        id: entry.id,
        task_type: entry.task_type,
        title: "Expired",
        type: "expired",
      };
    default:
      return null;
  }
}

function taskLabel(taskType: string | null): string {
  switch (taskType) {
    case "chat_message":
      return "Chat message";
    case "image_generation":
      return "Image generation";
    case "voice_generation":
      return "Voice generation";
    default:
      return "Credit usage";
  }
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
  adjustCredits,
  commitReservation,
  getCreditBalance,
  listLedgerRowsByIds,
  listLedger,
  listSettlementsByReservationIds,
  refundCredits,
  releaseReservation,
  reserveCredits,
} from "./ledger";
export { ensureMonthlyGrant } from "./grants";
export { handleCreditsCheckoutCompleted, isCreditsCheckoutSession } from "./webhooks";
export { TASK_CREDIT_COST, voiceGenerationCreditCost } from "./pricing";
export { CreditsError } from "./types";
