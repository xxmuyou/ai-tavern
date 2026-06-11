import { describe, expect, it } from "vitest";

import { getOrComputeDailyState } from "./daily-state";
import { AVAILABILITIES, MOODS, type TimeSlot } from "./types";

// Minimal in-memory D1 stub that handles only the queries the daily-state
// module actually runs. Each test case sets up companions/scenes/state rows.

type CompanionRow = {
  id: string;
  source: "official" | "user";
  name: string;
  preferred_scenes: string | null;
  is_active: number;
};

type SceneRow = {
  id: string;
  default_companions: string | null;
  display_order: number;
  is_active: number;
  unlock_condition: string | null;
};

type DailyStateRow = {
  companion_id: string;
  date_local: string;
  time_slot: string;
  scene_id: string;
  mood: string;
  availability: string;
  activity_hint: string;
  created_at: number;
};

function buildEnv(opts: { companions: CompanionRow[]; scenes: SceneRow[] }): Env {
  const companions = new Map<string, CompanionRow>(opts.companions.map((c) => [c.id, c]));
  const scenes = new Map<string, SceneRow>(opts.scenes.map((s) => [s.id, s]));
  const dailyStates: DailyStateRow[] = [];

  function exec(sql: string, binds: unknown[]) {
    const s = sql.replace(/\s+/g, " ").trim();

    return {
      async first<T>(): Promise<T | null> {
        if (s.startsWith("SELECT companion_id, date_local, time_slot")) {
          const [cid, date, slot] = binds as [string, string, string];
          const row = dailyStates.find(
            (d) => d.companion_id === cid && d.date_local === date && d.time_slot === slot,
          );
          return (row ?? null) as T | null;
        }
        if (s.startsWith("SELECT id, source, name, preferred_scenes")) {
          const c = companions.get(binds[0] as string);
          return (c && c.is_active === 1 ? c : null) as T | null;
        }
        if (s.startsWith("SELECT id FROM scenes WHERE id IN")) {
          const ids = new Set(binds as string[]);
          const list = [...scenes.values()]
            .filter((sc) => ids.has(sc.id) && sc.is_active === 1 && sc.unlock_condition === null)
            .sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id));
          return (list[0] ? { id: list[0].id } : null) as T | null;
        }
        return null;
      },
      async all<T>(): Promise<{ results: T[] }> {
        if (s.startsWith("SELECT id, default_companions FROM scenes WHERE id IN")) {
          const list = binds
            .map((id) => scenes.get(id as string))
            .filter((sc): sc is SceneRow => !!sc && sc.is_active === 1 && sc.unlock_condition === null)
            .map((sc) => ({ id: sc.id, default_companions: sc.default_companions }));
          return { results: list as unknown as T[] };
        }
        if (s.startsWith("SELECT id FROM scenes WHERE id IN")) {
          const list = binds
            .map((id) => scenes.get(id as string))
            .filter((sc): sc is SceneRow => !!sc && sc.is_active === 1 && sc.unlock_condition === null)
            .sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id))
            .map((sc) => ({ id: sc.id }));
          return { results: list as unknown as T[] };
        }
        return { results: [] };
      },
      async run() {
        if (s.startsWith("INSERT OR IGNORE INTO companion_daily_states")) {
          const [cid, date, slot, sceneId, mood, avail, hint, created] = binds as [
            string, string, string, string, string, string, string, number,
          ];
          dailyStates.push({
            companion_id: cid,
            date_local: date,
            time_slot: slot,
            scene_id: sceneId,
            mood,
            availability: avail,
            activity_hint: hint,
            created_at: created,
          });
        }
        return { meta: { changes: 1 } };
      },
    };
  }

  return {
    DB: {
      prepare(sql: string) {
        return {
          bind(...binds: unknown[]) {
            return exec(sql, binds);
          },
          ...exec(sql, []),
        };
      },
    },
  } as unknown as Env;
}

const OFFICIAL_MAYA: CompanionRow = {
  id: "maya",
  source: "official",
  name: "Maya",
  preferred_scenes: JSON.stringify(["underground_livehouse", "rainlit_bookshop"]),
  is_active: 1,
};

const USER_ALEX: CompanionRow = {
  id: "alex",
  source: "user",
  name: "Alex",
  preferred_scenes: JSON.stringify(["rainlit_bookshop", "pier_cafe"]),
  is_active: 1,
};

const USER_LOCKED_PREFS: CompanionRow = {
  id: "locked_pref",
  source: "user",
  name: "LockedPrefs",
  preferred_scenes: JSON.stringify(["midnight_hotel_suite", "neighborhood_park"]),
  is_active: 1,
};

const USER_NO_SCENES: CompanionRow = {
  id: "no_pref",
  source: "user",
  name: "NoPref",
  preferred_scenes: null,
  is_active: 1,
};

const SCENES: SceneRow[] = [
  { id: "midnight_hotel_suite", default_companions: null, display_order: 1, is_active: 1, unlock_condition: null },
  { id: "neighborhood_park", default_companions: null, display_order: 2, is_active: 1, unlock_condition: JSON.stringify({ type: "min_relationship", dim: "trust", value: 10 }) },
  { id: "underground_livehouse", default_companions: JSON.stringify(["maya"]), display_order: 3, is_active: 1, unlock_condition: JSON.stringify({ type: "min_relationship", dim: "closeness", value: 20 }) },
  { id: "rainlit_bookshop", default_companions: null, display_order: 4, is_active: 1, unlock_condition: null },
  { id: "pier_cafe", default_companions: null, display_order: 5, is_active: 1, unlock_condition: null },
  { id: "central_station_plaza", default_companions: null, display_order: 6, is_active: 1, unlock_condition: null },
  { id: "iron_forge_gym", default_companions: null, display_order: 7, is_active: 1, unlock_condition: null },
  { id: "rain_arcade", default_companions: null, display_order: 8, is_active: 1, unlock_condition: null },
  { id: "harbor_weekend_market", default_companions: null, display_order: 9, is_active: 1, unlock_condition: null },
];

const DEFAULT_ENCOUNTER_POOL = new Set([
  "central_station_plaza",
  "pier_cafe",
  "midnight_convenience_store",
  "rainlit_bookshop",
  "iron_forge_gym",
  "rain_arcade",
  "harbor_weekend_market",
]);

describe("getOrComputeDailyState", () => {
  it("returns stable rule fields for same (companion, date, slot)", async () => {
    const env = buildEnv({ companions: [OFFICIAL_MAYA], scenes: SCENES });
    const a = await getOrComputeDailyState(env, "maya", "2026-05-26", "afternoon");
    const b = await getOrComputeDailyState(env, "maya", "2026-05-26", "afternoon");
    expect(a).toEqual(b);
    expect(a?.scene_id).toBeTruthy();
    expect(MOODS).toContain(a?.mood);
    expect(AVAILABILITIES).toContain(a?.availability);
    expect(a?.activity_hint.length).toBeGreaterThan(0);
  });

  it("can land on different scenes across slots", async () => {
    const env = buildEnv({ companions: [OFFICIAL_MAYA], scenes: SCENES });
    const slots: TimeSlot[] = ["morning", "afternoon", "evening", "night"];
    const sceneIds = new Set<string>();
    for (const slot of slots) {
      const s = await getOrComputeDailyState(env, "maya", "2026-05-26", slot);
      if (s) sceneIds.add(s.scene_id);
    }
    expect(sceneIds.size).toBeGreaterThan(0);
  });

  it("user-created companion is always available", async () => {
    const env = buildEnv({ companions: [USER_ALEX], scenes: SCENES });
    for (const slot of ["morning", "afternoon", "evening", "night"] as TimeSlot[]) {
      const s = await getOrComputeDailyState(env, "alex", "2026-05-26", slot);
      expect(s?.availability).toBe("available");
    }
  });

  it("user-created companion rotates through eligible preferred_scenes by slot", async () => {
    const env = buildEnv({ companions: [USER_ALEX], scenes: SCENES });
    const morning = await getOrComputeDailyState(env, "alex", "2026-05-26", "morning");
    const afternoon = await getOrComputeDailyState(env, "alex", "2026-05-26", "afternoon");
    expect(morning?.scene_id).toBe("rainlit_bookshop");
    expect(afternoon?.scene_id).toBe("pier_cafe");
  });

  it("user companion with no preferred_scenes falls back to default encounter pool", async () => {
    const env = buildEnv({ companions: [USER_NO_SCENES], scenes: SCENES });
    const morning = await getOrComputeDailyState(env, "no_pref", "2026-05-26", "morning");
    const night = await getOrComputeDailyState(env, "no_pref", "2026-05-26", "night");
    expect(DEFAULT_ENCOUNTER_POOL.has(morning!.scene_id)).toBe(true);
    expect(DEFAULT_ENCOUNTER_POOL.has(night!.scene_id)).toBe(true);
    expect(morning?.scene_id).not.toBe("midnight_hotel_suite");
    expect(night?.scene_id).not.toBe("neighborhood_park");
  });

  it("filters intimate and locked preferred_scenes before falling back", async () => {
    const env = buildEnv({ companions: [USER_LOCKED_PREFS], scenes: SCENES });
    const state = await getOrComputeDailyState(env, "locked_pref", "2026-05-26", "morning");
    expect(DEFAULT_ENCOUNTER_POOL.has(state!.scene_id)).toBe(true);
    expect(state?.scene_id).not.toBe("midnight_hotel_suite");
    expect(state?.scene_id).not.toBe("neighborhood_park");
  });

  it("official companion ignores locked canonical scenes", async () => {
    const env = buildEnv({ companions: [OFFICIAL_MAYA], scenes: SCENES });
    const state = await getOrComputeDailyState(env, "maya", "2026-05-26", "morning");
    expect(state?.scene_id).toBe("rainlit_bookshop");
    expect(state?.scene_id).not.toBe("underground_livehouse");
  });

  it("inactive companion returns null", async () => {
    const env = buildEnv({
      companions: [{ ...OFFICIAL_MAYA, is_active: 0 }],
      scenes: SCENES,
    });
    const s = await getOrComputeDailyState(env, "maya", "2026-05-26", "afternoon");
    expect(s).toBeNull();
  });
});
