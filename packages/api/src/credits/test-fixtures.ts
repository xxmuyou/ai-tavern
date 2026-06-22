import type { CreditAccountRow, CreditLedgerRow } from "./types";

type State = {
  accounts: Map<string, CreditAccountRow>;
  ledger: CreditLedgerRow[];
};

function cloneState(state: State): State {
  return {
    accounts: new Map([...state.accounts].map(([k, v]) => [k, { ...v }])),
    ledger: state.ledger.map((row) => ({ ...row })),
  };
}

class UniqueViolation extends Error {
  constructor() {
    super("UNIQUE constraint failed: credit_ledger_entries");
  }
}

type Mode = "run" | "first" | "all";

/**
 * In-memory D1 stand-in that understands the exact SQL emitted by
 * credits/ledger.ts. batch() runs statements against a cloned state and only
 * commits if all succeed, mirroring D1's transaction + unique-constraint
 * rollback semantics so the atomic/idempotent ledger paths are exercised
 * faithfully (there is no real SQLite in the test harness).
 */
function execute(state: State, sql: string, values: unknown[], mode: Mode): unknown {
  if (sql.includes("INSERT INTO analytics_events")) {
    return { meta: { changes: 1 } };
  }

  if (sql.includes("INSERT OR IGNORE INTO credit_accounts")) {
    const [userId, now] = values as [string, number];
    if (!state.accounts.has(userId)) {
      state.accounts.set(userId, { available_credits: 0, reserved_credits: 0, updated_at: now, user_id: userId });
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0 } };
  }

  if (sql.startsWith("INSERT INTO credit_ledger_entries")) {
    return insertLedger(state, values);
  }

  if (sql.startsWith("UPDATE credit_accounts SET available_credits")) {
    return updateAccount(state, values);
  }

  if (sql.includes("FROM credit_accounts WHERE user_id = ?")) {
    const [userId] = values as [string];
    return state.accounts.get(userId) ?? null;
  }

  if (sql.includes("WHERE id = ? AND type = 'reserve'")) {
    const [id] = values as [string];
    return state.ledger.find((row) => row.id === id && row.type === "reserve") ?? null;
  }

  if (sql.includes("reference_type = 'reservation'") && sql.includes("reference_id IN")) {
    const [userId, ...reservationIds] = values as [string, ...string[]];
    const reservationIdSet = new Set(reservationIds);
    return {
      results: state.ledger.filter(
        (row) =>
          row.user_id === userId &&
          row.reference_type === "reservation" &&
          (row.type === "commit" || row.type === "release") &&
          row.reference_id !== null &&
          reservationIdSet.has(row.reference_id),
      ),
    };
  }

  if (sql.includes("type IN ('commit', 'release')")) {
    const [referenceId] = values as [string];
    return (
      state.ledger.find(
        (row) =>
          row.reference_type === "reservation" &&
          row.reference_id === referenceId &&
          (row.type === "commit" || row.type === "release"),
      ) ?? null
    );
  }

  if (sql.includes("WHERE type = ? AND reference_type = ? AND reference_id = ?")) {
    const [type, referenceType, referenceId] = values as [string, string, string];
    return (
      state.ledger.find(
        (row) => row.type === type && row.reference_type === referenceType && row.reference_id === referenceId,
      ) ?? null
    );
  }

  if (sql.includes("credit_ledger_entries WHERE id = ?")) {
    const [id] = values as [string];
    return state.ledger.find((row) => row.id === id) ?? null;
  }

  if (sql.includes("WHERE user_id = ? AND id IN")) {
    const [userId, ...ids] = values as [string, ...string[]];
    const idSet = new Set(ids);
    return { results: state.ledger.filter((row) => row.user_id === userId && idSet.has(row.id)) };
  }

  if (sql.includes("ORDER BY created_at DESC")) {
    return listLedger(state, sql, values);
  }

  throw new Error(`Unrecognized SQL in credits test fixture: ${sql}`);
}

function insertLedger(state: State, values: unknown[]): { meta: { changes: number } } {
  const [
    id,
    userId,
    type,
    amount,
    availableDelta,
    reservedDelta,
    taskType,
    referenceType,
    referenceId,
    stripeSessionId,
    stripePaymentId,
    expiresAt,
    metadata,
    createdAt,
  ] = values as [
    string,
    string,
    CreditLedgerRow["type"],
    number,
    number,
    number,
    string | null,
    string | null,
    string | null,
    string | null,
    string | null,
    number | null,
    string | null,
    number,
  ];

  const account = state.accounts.get(userId);
  if (!account) return { meta: { changes: 0 } };
  if (availableDelta < 0 && account.available_credits < -availableDelta) return { meta: { changes: 0 } };
  if (reservedDelta < 0 && account.reserved_credits < -reservedDelta) return { meta: { changes: 0 } };

  if (referenceType && referenceId) {
    const duplicate = state.ledger.some(
      (row) => row.type === type && row.reference_type === referenceType && row.reference_id === referenceId,
    );
    if (duplicate) throw new UniqueViolation();
  }

  state.ledger.push({
    amount,
    balance_after: account.available_credits + availableDelta,
    created_at: createdAt,
    expires_at: expiresAt,
    id,
    metadata,
    reference_id: referenceId,
    reference_type: referenceType,
    reserved_after: account.reserved_credits + reservedDelta,
    stripe_payment_id: stripePaymentId,
    stripe_session_id: stripeSessionId,
    task_type: taskType,
    type,
    user_id: userId,
  });
  return { meta: { changes: 1 } };
}

function updateAccount(state: State, values: unknown[]): { meta: { changes: number } } {
  const [availableDelta, reservedDelta, now, userId] = values as [number, number, number, string];
  const account = state.accounts.get(userId);
  if (!account) return { meta: { changes: 0 } };
  if (availableDelta < 0 && account.available_credits < -availableDelta) return { meta: { changes: 0 } };
  if (reservedDelta < 0 && account.reserved_credits < -reservedDelta) return { meta: { changes: 0 } };

  account.available_credits += availableDelta;
  account.reserved_credits += reservedDelta;
  account.updated_at = now;
  return { meta: { changes: 1 } };
}

function listLedger(state: State, sql: string, values: unknown[]): { results: CreditLedgerRow[] } {
  const hasCursor = sql.includes("created_at < ?");
  const userId = values[0] as string;
  const cursorTime = hasCursor ? (values[1] as number) : null;
  const limit = values[values.length - 1] as number;

  const rows = state.ledger
    .filter((row) => row.user_id === userId && (cursorTime === null || row.created_at < cursorTime))
    .sort((a, b) => (b.created_at - a.created_at) || b.id.localeCompare(a.id))
    .slice(0, limit);
  return { results: rows };
}

type Statement = {
  __sql: string;
  __values: unknown[];
  run(): Promise<unknown>;
  first(): Promise<unknown>;
  all(): Promise<unknown>;
};

export type CreditsTestEnv = Env & {
  __state: State;
};

export function createCreditsTestEnv(): CreditsTestEnv {
  const state: State = { accounts: new Map(), ledger: [] };

  const prepare = (sql: string) => ({
    bind(...values: unknown[]): Statement {
      return {
        __sql: sql,
        __values: values,
        async all() {
          return execute(state, sql, values, "all");
        },
        async first() {
          return execute(state, sql, values, "first");
        },
        async run() {
          return execute(state, sql, values, "run");
        },
      };
    },
  });

  const db = {
    async batch(statements: Statement[]): Promise<unknown[]> {
      const draft = cloneState(state);
      const results: unknown[] = [];
      for (const stmt of statements) {
        results.push(execute(draft, stmt.__sql, stmt.__values, "run"));
      }
      state.accounts = draft.accounts;
      state.ledger = draft.ledger;
      return results;
    },
    prepare,
  };

  return { DB: db, __state: state } as unknown as CreditsTestEnv;
}
