import { describe, expect, it } from "vitest";

import { COMMITTED_DECAY } from "../life/config";
import { applyCommittedDecayIfDue } from "./decay";

type Row = {
  closeness: number;
  trust: number;
  romance: number;
  friendship: number;
  hostility: number;
  tension: number;
  distance: number;
  last_interaction_at: number;
};

function buildEnv(row: Row | null) {
  const state: { current: Row | null } = { current: row };

  return {
    DB: {
      prepare(sql: string) {
        return {
          bind(...binds: unknown[]) {
            return {
              async first() {
                if (sql.includes("SELECT closeness")) return state.current;
                return null;
              },
              async run() {
                if (sql.startsWith("UPDATE relationships")) {
                  const [closeness, trust, romance, last_interaction_at] = binds as [number, number, number, number];
                  if (state.current) {
                    state.current = { ...state.current, closeness, trust, romance, last_interaction_at };
                  }
                }
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
  } as unknown as Env;
}

const COMMITTED: Row = {
  closeness: 80, trust: 70, romance: 80, friendship: 60,
  hostility: 0, tension: 0, distance: 0,
  last_interaction_at: 0,
};

describe("applyCommittedDecayIfDue", () => {
  it("no-op when there is no relationship row", async () => {
    const env = buildEnv(null);
    const r = await applyCommittedDecayIfDue(env, "u1", "maya");
    expect(r.applied).toBe(false);
  });

  it("no-op when not in committed stage", async () => {
    const env = buildEnv({ ...COMMITTED, romance: 40 }); // dating, not committed
    const now = COMMITTED_DECAY.threshold_ms + 30 * 24 * 60 * 60 * 1000;
    const r = await applyCommittedDecayIfDue(env, "u1", "maya", now);
    expect(r.applied).toBe(false);
  });

  it("no-op when idle is under threshold even if committed", async () => {
    const env = buildEnv(COMMITTED);
    const now = COMMITTED_DECAY.threshold_ms - 1;
    const r = await applyCommittedDecayIfDue(env, "u1", "maya", now);
    expect(r.applied).toBe(false);
  });

  it("decays committed when idle exceeds threshold", async () => {
    const env = buildEnv(COMMITTED);
    const now = COMMITTED_DECAY.threshold_ms + 10 * 24 * 60 * 60 * 1000;
    const r = await applyCommittedDecayIfDue(env, "u1", "maya", now);
    expect(r.applied).toBe(true);
    if (r.applied) {
      expect(r.days_decayed).toBe(10);
    }
  });

  it("does not double-apply on consecutive calls", async () => {
    const env = buildEnv(COMMITTED);
    const now = COMMITTED_DECAY.threshold_ms + 5 * 24 * 60 * 60 * 1000;
    const first = await applyCommittedDecayIfDue(env, "u1", "maya", now);
    const second = await applyCommittedDecayIfDue(env, "u1", "maya", now);
    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
  });
});
