import {
  CreditsError,
  type CreditAccountRow,
  type CreditBalance,
  type CreditLedgerRow,
  type CreditLedgerType,
  type ReserveResult,
} from "./types";

const LEDGER_COLUMNS =
  "id, user_id, type, amount, balance_after, reserved_after, task_type, " +
  "reference_type, reference_id, stripe_session_id, stripe_payment_id, " +
  "expires_at, metadata, created_at";

type MutationSpec = {
  userId: string;
  type: CreditLedgerType;
  /** Value stored in ledger.amount (signed: negative = consume, positive = add/release). */
  amount: number;
  availableDelta: number;
  reservedDelta: number;
  taskType?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  stripeSessionId?: string | null;
  stripePaymentId?: string | null;
  expiresAt?: number | null;
  metadata?: Record<string, unknown> | null;
  now: number;
};

type MutationResult = {
  ledger: CreditLedgerRow;
  account: CreditAccountRow;
  created: boolean;
};

/**
 * Atomically applies an account delta and writes its ledger entry in a single
 * D1 transaction (batch). Negative deltas are gated by a `>=` predicate so an
 * insufficient balance leaves both the account and the ledger untouched, and
 * the gated INSERT…SELECT computes balance_after / reserved_after from the
 * pre-mutation account row. Reference uniqueness (idx_credit_ledger_reference)
 * makes the whole operation idempotent: a duplicate reference rolls the batch
 * back and the existing entry is returned unchanged. See spec-021 §B.
 */
async function applyCreditMutation(env: Env, spec: MutationSpec): Promise<MutationResult> {
  await ensureAccount(env, spec.userId, spec.now);

  const conditions = ["user_id = ?"];
  const conditionBinds: unknown[] = [spec.userId];
  if (spec.availableDelta < 0) {
    conditions.push("available_credits >= ?");
    conditionBinds.push(-spec.availableDelta);
  }
  if (spec.reservedDelta < 0) {
    conditions.push("reserved_credits >= ?");
    conditionBinds.push(-spec.reservedDelta);
  }
  const gated = conditions.length > 1;
  const whereClause = conditions.join(" AND ");

  const id = crypto.randomUUID();
  const metadataJson = spec.metadata ? JSON.stringify(spec.metadata) : null;

  const insertSql =
    `INSERT INTO credit_ledger_entries (${LEDGER_COLUMNS})\n` +
    "SELECT ?, ?, ?, ?, available_credits + ?, reserved_credits + ?, ?, ?, ?, ?, ?, ?, ?, ?\n" +
    `FROM credit_accounts WHERE ${whereClause}`;
  const insertBinds = [
    id,
    spec.userId,
    spec.type,
    spec.amount,
    spec.availableDelta,
    spec.reservedDelta,
    spec.taskType ?? null,
    spec.referenceType ?? null,
    spec.referenceId ?? null,
    spec.stripeSessionId ?? null,
    spec.stripePaymentId ?? null,
    spec.expiresAt ?? null,
    metadataJson,
    spec.now,
    ...conditionBinds,
  ];

  const updateSql =
    "UPDATE credit_accounts SET available_credits = available_credits + ?, " +
    `reserved_credits = reserved_credits + ?, updated_at = ? WHERE ${whereClause}`;
  const updateBinds = [spec.availableDelta, spec.reservedDelta, spec.now, ...conditionBinds];

  let results: D1Result[];
  try {
    results = await env.DB.batch([
      env.DB.prepare(insertSql).bind(...insertBinds),
      env.DB.prepare(updateSql).bind(...updateBinds),
    ]);
  } catch (err) {
    if (isUniqueViolation(err) && spec.referenceType && spec.referenceId) {
      const existing = await getLedgerByReference(env, spec.type, spec.referenceType, spec.referenceId);
      if (existing) {
        return { account: await getAccountOrZero(env, spec.userId), created: false, ledger: existing };
      }
    }
    throw err;
  }

  const inserted = results[0]?.meta?.changes ?? 0;
  if (inserted === 0) {
    if (gated) {
      throw new CreditsError("credits_insufficient", 402);
    }
    throw new CreditsError("credit_mutation_failed", 500);
  }

  const ledger = await getLedgerById(env, id);
  if (!ledger) {
    throw new CreditsError("credit_mutation_failed", 500);
  }
  return { account: await getAccountOrZero(env, spec.userId), created: true, ledger };
}

export async function ensureAccount(env: Env, userId: string, now: number): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO credit_accounts (user_id, available_credits, reserved_credits, updated_at)
     VALUES (?, 0, 0, ?)`,
  )
    .bind(userId, now)
    .run();
}

export async function getCreditBalance(env: Env, userId: string): Promise<CreditBalance> {
  const account = await getAccount(env, userId);
  return {
    available_credits: account?.available_credits ?? 0,
    reserved_credits: account?.reserved_credits ?? 0,
  };
}

export async function reserveCredits(
  env: Env,
  input: {
    userId: string;
    taskType: string;
    referenceType: string;
    referenceId: string;
    amount: number;
  },
): Promise<ReserveResult> {
  assertPositiveInt(input.amount);
  const { ledger, account } = await applyCreditMutation(env, {
    amount: -input.amount,
    availableDelta: -input.amount,
    now: Date.now(),
    referenceId: input.referenceId,
    referenceType: input.referenceType,
    reservedDelta: input.amount,
    taskType: input.taskType,
    type: "reserve",
    userId: input.userId,
  });
  return {
    available_credits: account.available_credits,
    reservation_id: ledger.id,
    reserved_credits: account.reserved_credits,
  };
}

export async function commitReservation(env: Env, reservationId: string): Promise<void> {
  const reserve = await getReserveEntry(env, reservationId);
  if (!reserve) {
    throw new CreditsError("reservation_not_found", 404);
  }
  const settlement = await getSettlement(env, reservationId);
  if (settlement) {
    if (settlement.type === "commit") return;
    throw new CreditsError("reservation_already_settled", 409);
  }

  const amount = Math.abs(reserve.amount);
  await applyCreditMutation(env, {
    amount: 0,
    availableDelta: 0,
    metadata: { reserved_delta: -amount },
    now: Date.now(),
    referenceId: reservationId,
    referenceType: "reservation",
    reservedDelta: -amount,
    taskType: reserve.task_type,
    type: "commit",
    userId: reserve.user_id,
  });
}

export async function releaseReservation(
  env: Env,
  reservationId: string,
  reason: string,
): Promise<void> {
  const reserve = await getReserveEntry(env, reservationId);
  if (!reserve) {
    throw new CreditsError("reservation_not_found", 404);
  }
  const settlement = await getSettlement(env, reservationId);
  if (settlement) {
    if (settlement.type === "release") return;
    throw new CreditsError("reservation_already_settled", 409);
  }

  const amount = Math.abs(reserve.amount);
  await applyCreditMutation(env, {
    amount,
    availableDelta: amount,
    metadata: { reason, reserved_delta: -amount },
    now: Date.now(),
    referenceId: reservationId,
    referenceType: "reservation",
    reservedDelta: -amount,
    taskType: reserve.task_type,
    type: "release",
    userId: reserve.user_id,
  });
}

export async function refundCredits(
  env: Env,
  input: {
    userId: string;
    referenceType: string;
    referenceId: string;
    amount: number;
    reason: string;
  },
): Promise<void> {
  assertPositiveInt(input.amount);
  await applyCreditMutation(env, {
    amount: input.amount,
    availableDelta: input.amount,
    metadata: { reason: input.reason },
    now: Date.now(),
    referenceId: input.referenceId,
    referenceType: input.referenceType,
    reservedDelta: 0,
    type: "refund",
    userId: input.userId,
  });
}

export async function adjustCredits(
  env: Env,
  input: {
    userId: string;
    amount: number;
    adminId: string;
    reason: string;
  },
): Promise<{ balance_after: number; entry: CreditLedgerRow }> {
  assertPositiveInt(input.amount);
  const { ledger } = await applyCreditMutation(env, {
    amount: input.amount,
    availableDelta: input.amount,
    metadata: { admin_id: input.adminId, reason: input.reason },
    now: Date.now(),
    reservedDelta: 0,
    type: "adjustment",
    userId: input.userId,
  });
  return { balance_after: ledger.balance_after ?? 0, entry: ledger };
}

export async function grantCredits(
  env: Env,
  input: {
    userId: string;
    amount: number;
    referenceType: string;
    referenceId: string;
    expiresAt?: number | null;
    now: number;
  },
): Promise<boolean> {
  assertPositiveInt(input.amount);
  const { created } = await applyCreditMutation(env, {
    amount: input.amount,
    availableDelta: input.amount,
    expiresAt: input.expiresAt ?? null,
    now: input.now,
    referenceId: input.referenceId,
    referenceType: input.referenceType,
    reservedDelta: 0,
    type: "grant_monthly",
    userId: input.userId,
  });
  return created;
}

export async function recordPurchase(
  env: Env,
  input: {
    userId: string;
    sessionId: string;
    paymentId: string | null;
    credits: number;
    packageId: string;
    now?: number;
  },
): Promise<boolean> {
  assertPositiveInt(input.credits);
  const { created } = await applyCreditMutation(env, {
    amount: input.credits,
    availableDelta: input.credits,
    metadata: { credit_package: input.packageId },
    now: input.now ?? Date.now(),
    referenceId: input.sessionId,
    referenceType: "stripe_session",
    reservedDelta: 0,
    stripePaymentId: input.paymentId,
    stripeSessionId: input.sessionId,
    type: "purchase",
    userId: input.userId,
  });
  return created;
}

export async function listLedger(
  env: Env,
  userId: string,
  options: { limit?: number; beforeId?: string | null } = {},
): Promise<CreditLedgerRow[]> {
  const limit = clampLimit(options.limit);
  let cursorTime: number | null = null;
  if (options.beforeId) {
    const cursor = await getLedgerById(env, options.beforeId);
    if (cursor) cursorTime = cursor.created_at;
  }

  const where = cursorTime === null ? "user_id = ?" : "user_id = ? AND created_at < ?";
  const binds = cursorTime === null ? [userId, limit] : [userId, cursorTime, limit];
  const { results } = await env.DB.prepare(
    `SELECT ${LEDGER_COLUMNS} FROM credit_ledger_entries
     WHERE ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
  )
    .bind(...binds)
    .all<CreditLedgerRow>();
  return results ?? [];
}

async function getAccount(env: Env, userId: string): Promise<CreditAccountRow | null> {
  return env.DB.prepare(
    "SELECT user_id, available_credits, reserved_credits, updated_at FROM credit_accounts WHERE user_id = ?",
  )
    .bind(userId)
    .first<CreditAccountRow>();
}

async function getAccountOrZero(env: Env, userId: string): Promise<CreditAccountRow> {
  const account = await getAccount(env, userId);
  return account ?? { available_credits: 0, reserved_credits: 0, updated_at: 0, user_id: userId };
}

async function getLedgerById(env: Env, id: string): Promise<CreditLedgerRow | null> {
  return env.DB.prepare(`SELECT ${LEDGER_COLUMNS} FROM credit_ledger_entries WHERE id = ?`)
    .bind(id)
    .first<CreditLedgerRow>();
}

async function getLedgerByReference(
  env: Env,
  type: CreditLedgerType,
  referenceType: string,
  referenceId: string,
): Promise<CreditLedgerRow | null> {
  return env.DB.prepare(
    `SELECT ${LEDGER_COLUMNS} FROM credit_ledger_entries
     WHERE type = ? AND reference_type = ? AND reference_id = ?`,
  )
    .bind(type, referenceType, referenceId)
    .first<CreditLedgerRow>();
}

async function getReserveEntry(env: Env, reservationId: string): Promise<CreditLedgerRow | null> {
  return env.DB.prepare(
    `SELECT ${LEDGER_COLUMNS} FROM credit_ledger_entries WHERE id = ? AND type = 'reserve'`,
  )
    .bind(reservationId)
    .first<CreditLedgerRow>();
}

async function getSettlement(env: Env, reservationId: string): Promise<CreditLedgerRow | null> {
  return env.DB.prepare(
    `SELECT ${LEDGER_COLUMNS} FROM credit_ledger_entries
     WHERE reference_type = 'reservation' AND reference_id = ? AND type IN ('commit', 'release')
     LIMIT 1`,
  )
    .bind(reservationId)
    .first<CreditLedgerRow>();
}

function assertPositiveInt(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new CreditsError("invalid_amount", 400);
  }
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || !limit || limit <= 0) return 50;
  return Math.min(Math.floor(limit), 100);
}

function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /unique constraint/i.test(message);
}
