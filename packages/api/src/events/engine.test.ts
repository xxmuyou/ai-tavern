import { afterEach, describe, expect, it, vi } from "vitest";

import { evaluateConflictTrigger, evaluateTriggersForScene } from "./engine";
import type { EventTemplate } from "./types";

afterEach(() => {
  vi.restoreAllMocks();
});

const INVITATION: EventTemplate = template({
  event_type: "invitation",
  id: "tpl_invitation",
  min_closeness: 30,
  min_trust: 20,
  priority: 30,
});
const GIFT: EventTemplate = template({ event_type: "gift", id: "tpl_gift", min_closeness: 40, priority: 20 });
const CONFLICT: EventTemplate = template({
  event_type: "conflict",
  id: "tpl_conflict",
  priority: 80,
  signal_trigger: "hostility:2",
});

describe("events engine", () => {
  it("filters by scene possible_events", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const env = createEnv({
      relationships: [{ closeness: 50, companion_id: "maya", trust: 40, user_id: "u-1" }],
      templates: [INVITATION, GIFT],
    });

    const candidate = await evaluateTriggersForScene(
      env,
      "u-1",
      { id: "cafe", mood: "Calm", name: "Cafe", possible_events: '["gift"]' },
      [{ id: "maya" }],
      1_000_000,
    );

    expect(candidate?.template.event_type).toBe("gift");
  });

  it("skips a companion that already has any pending event", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const env = createEnv({
      events: [{ companion_id: "maya", created_at: 1, event_type: "gift", metadata: null, status: "pending", user_id: "u-1" }],
      relationships: [{ closeness: 50, companion_id: "maya", trust: 40, user_id: "u-1" }],
      templates: [INVITATION],
    });

    const candidate = await evaluateTriggersForScene(
      env,
      "u-1",
      { id: "cafe", mood: "Calm", name: "Cafe", possible_events: '["invitation"]' },
      [{ id: "maya" }],
      1_000_000,
    );

    expect(candidate).toBeNull();
  });

  it("prevents lifetime milestone subtype repeats", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const env = createEnv({
      events: [
        {
          companion_id: "maya",
          created_at: 1,
          event_type: "milestone",
          metadata: '{"milestone_type":"first_30_days"}',
          status: "resolved",
          user_id: "u-1",
        },
      ],
      relationships: [{ closeness: 0, companion_id: "maya", first_met_at: 0, trust: 0, user_id: "u-1" }],
      templates: [template({ event_type: "milestone", id: "tpl_milestone", priority: 70 })],
    });

    const candidate = await evaluateTriggersForScene(
      env,
      "u-1",
      { id: "park", mood: "Open", name: "Park", possible_events: '["milestone"]' },
      [{ id: "maya" }],
      31 * 86_400_000,
    );

    expect(candidate).toBeNull();
  });

  it("detects conflict only when the signal threshold is reached", async () => {
    const env = createEnv({ templates: [CONFLICT] });

    await expect(evaluateConflictTrigger(env, "u-1", "maya", null, { hostility: 1 }, 1_000)).resolves.toBeNull();
    await expect(evaluateConflictTrigger(env, "u-1", "maya", null, { hostility: 2 }, 1_000)).resolves.toMatchObject({
      companionId: "maya",
      sceneId: null,
    });
  });
});

type RelationshipFixture = {
  user_id: string;
  companion_id: string;
  closeness?: number;
  trust?: number;
  first_met_at?: number;
};

type EventFixture = {
  user_id: string;
  companion_id: string;
  event_type: string;
  status: string;
  created_at: number;
  metadata: string | null;
};

function template(partial: Partial<EventTemplate> & { id: string; event_type: EventTemplate["event_type"] }): EventTemplate {
  return {
    companion_filter: "all",
    cooldown_seconds: partial.cooldown_seconds ?? 60,
    max_distance: null,
    max_hostility: null,
    max_tension: null,
    min_closeness: null,
    min_friendship: null,
    min_romance: null,
    min_trust: null,
    options: [{ id: "ok", prompt_hint: "ok", semantic: "ok", signals: {} }],
    priority: 0,
    signal_trigger: null,
    trigger_probability: 1,
    ...partial,
  };
}

function createEnv(opts: {
  templates?: EventTemplate[];
  relationships?: RelationshipFixture[];
  events?: EventFixture[];
}): Env {
  const templates = opts.templates ?? [];
  const relationships = opts.relationships ?? [];
  const events = opts.events ?? [];

  return {
    DB: {
      prepare(sql: string) {
        const exec = (values: unknown[]) => ({
          async first<T>(): Promise<T | null> {
            if (sql.includes("FROM event_templates")) {
              const eventType = values[0];
              return (templates.find((tpl) => tpl.event_type === eventType) ? rowForTemplate(templates.find((tpl) => tpl.event_type === eventType)!) : null) as T | null;
            }
            if (sql.includes("status = 'pending'")) {
              const [userId, companionId] = values;
              return (events.find((event) => event.user_id === userId && event.companion_id === companionId && event.status === "pending")
                ? { id: "evt" }
                : null) as T | null;
            }
            if (sql.includes("MAX(created_at)")) {
              const [userId, companionId, eventType] = values;
              const latest = events
                .filter((event) => event.user_id === userId && event.companion_id === companionId && event.event_type === eventType)
                .reduce<number | null>((max, event) => (max === null || event.created_at > max ? event.created_at : max), null);
              return { latest_created_at: latest } as T;
            }
            if (sql.includes("FROM relationships")) {
              const [userId, companionId] = values;
              const rel = relationships.find((item) => item.user_id === userId && item.companion_id === companionId);
              return rel
                ? ({
                    closeness: rel.closeness ?? 0,
                    distance: 0,
                    first_met_at: rel.first_met_at ?? 0,
                    friendship: 0,
                    hostility: 0,
                    last_interaction_at: 0,
                    level_label: "Stranger",
                    romance: 0,
                    tension: 0,
                    trust: rel.trust ?? 0,
                  } as T)
                : null;
            }
            if (sql.includes("FROM threads")) return null;
            return null;
          },
          async all<T>(): Promise<{ results: T[] }> {
            if (sql.includes("event_type = 'milestone'")) {
              const [userId, companionId] = values;
              return {
                results: events
                  .filter((event) => event.user_id === userId && event.companion_id === companionId && event.event_type === "milestone")
                  .map((event) => ({ metadata: event.metadata })) as T[],
              };
            }
            return { results: [] };
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
  } as unknown as Env;
}

function rowForTemplate(template: EventTemplate) {
  return {
    ...template,
    options_json: JSON.stringify(template.options),
  };
}
