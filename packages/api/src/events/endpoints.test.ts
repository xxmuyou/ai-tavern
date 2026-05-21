import { describe, expect, it } from "vitest";

import type { UserRecord } from "../identity";
import { listEvents } from "./list";
import { resolveEvent } from "./resolve";
import type { EventRow } from "./types";

const USER: UserRecord = { email: "u@example.com", id: "u-1" };

describe("events endpoints", () => {
  it("lists events by user and status with limit clamp", async () => {
    const env = createEnv({
      events: [
        eventRow({ id: "e-1", status: "pending", user_id: "u-1" }),
        eventRow({ id: "e-2", status: "resolved", user_id: "u-1" }),
        eventRow({ id: "e-3", status: "pending", user_id: "other" }),
      ],
    });

    const response = await listEvents(new Request("http://x/events?status=pending&limit=100"), env, USER);
    const body = (await response.json()) as { events: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(body.events.map((event) => event.id)).toEqual(["e-1"]);
  });

  it("resolves using the event template snapshot instead of current templates", async () => {
    const env = createEnv({
      companions: [{ id: "maya", name: "Maya", personality: null, speech_style: null }],
      events: [
        eventRow({
          id: "e-1",
          payload: JSON.stringify({
            description: "Maya invites you.",
            options: [{ id: "accept_eager", label: "I'd love to" }],
          }),
          template_snapshot: JSON.stringify({
            companion_filter: "all",
            event_type: "invitation",
            options: [
              {
                id: "accept_eager",
                prompt_hint: "yes",
                semantic: "accept",
                signals: { closeness: 2 },
              },
            ],
            template_id: "old-template",
            version: 1,
          }),
          user_id: "u-1",
        }),
      ],
      relationships: [{ closeness: 20, companion_id: "maya", user_id: "u-1" }],
    });

    const response = await resolveEvent(
      new Request("http://x/events/e-1/resolve", {
        body: JSON.stringify({ option_id: "accept_eager" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      env,
      USER,
      "e-1",
    );
    const body = (await response.json()) as { result: { signals: { closeness: number } } };

    expect(response.status).toBe(200);
    expect(body.result.signals.closeness).toBe(2);
    expect(env.state.resolution?.option_id).toBe("accept_eager");
    expect(env.state.relationship?.closeness).toBe(22);
  });
});

type RelationshipFixture = {
  user_id: string;
  companion_id: string;
  closeness: number;
};

type CompanionFixture = {
  id: string;
  name: string;
  personality: string | null;
  speech_style: string | null;
};

function createEnv(opts: {
  events?: EventRow[];
  relationships?: RelationshipFixture[];
  companions?: CompanionFixture[];
}): Env & { state: { resolution: Record<string, unknown> | null; relationship: RelationshipFixture | null } } {
  const events = opts.events ?? [];
  const relationships = opts.relationships ?? [];
  const companions = opts.companions ?? [];
  const state = {
    relationship: relationships[0] ?? null,
    resolution: null as Record<string, unknown> | null,
  };

  return {
    DB: {
      prepare(sql: string) {
        const exec = (values: unknown[]) => ({
          async all<T>(): Promise<{ results: T[] }> {
            if (sql.includes("FROM events") && sql.includes("WHERE user_id = ? AND status = ?")) {
              const [userId, status] = values;
              return {
                results: events
                  .filter((event) => event.user_id === userId && event.status === status)
                  .sort((a, b) => b.created_at - a.created_at)
                  .slice(0, values.at(-1) as number) as T[],
              };
            }
            return { results: [] };
          },
          async first<T>(): Promise<T | null> {
            if (sql.includes("FROM events") && sql.includes("WHERE id = ?")) {
              return (events.find((event) => event.id === values[0]) ?? null) as T | null;
            }
            if (sql.includes("FROM relationships")) {
              const [userId, companionId] = values;
              const rel = relationships.find((item) => item.user_id === userId && item.companion_id === companionId);
              return rel
                ? ({
                    closeness: rel.closeness,
                    distance: 0,
                    first_met_at: 0,
                    friendship: 0,
                    hostility: 0,
                    last_interaction_at: 0,
                    level_label: "Stranger",
                    romance: 0,
                    tension: 0,
                    trust: 0,
                  } as T)
                : null;
            }
            if (sql.includes("FROM companions")) {
              return (companions.find((companion) => companion.id === values[0]) ?? null) as T | null;
            }
            if (sql.includes("FROM llm_config")) {
              return null;
            }
            return null;
          },
          async run(): Promise<{ meta: { changes: number } }> {
            if (sql.includes("UPDATE relationships") && state.relationship) {
              state.relationship.closeness = values[0] as number;
            }
            if (sql.includes("UPDATE events SET status = 'resolved'")) {
              state.resolution = JSON.parse(values[0] as string) as Record<string, unknown>;
            }
            return { meta: { changes: 1 } };
          },
        });
        return {
          ...exec([]),
          bind(...values: unknown[]) {
            return exec(values);
          },
        };
      },
    },
    state,
  } as unknown as Env & { state: { resolution: Record<string, unknown> | null; relationship: RelationshipFixture | null } };
}

function eventRow(partial: Partial<EventRow>): EventRow {
  return {
    companion_id: "maya",
    created_at: 1,
    event_type: "invitation",
    id: "e",
    metadata: null,
    payload: JSON.stringify({ description: "desc", options: [] }),
    resolution: null,
    resolved_at: null,
    scene_id: null,
    status: "pending",
    template_id: "tpl",
    template_snapshot: JSON.stringify({
      companion_filter: "all",
      event_type: "invitation",
      options: [],
      template_id: "tpl",
      version: 1,
    }),
    user_id: "u-1",
    ...partial,
  };
}
