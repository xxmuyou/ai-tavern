import { describe, expect, it } from "vitest";

import {
  ACTIVITY_STATUSES,
  ACTIVITY_TYPES,
  AVAILABILITIES,
  MEMORY_TYPES,
  MOODS,
  RELATIONSHIP_STAGES,
  TIME_SLOTS,
} from "./types";

// Drift guards. If these enums change shape we want a noisy test failure so
// the contracts.md doc and the @xtbit/shared mirror get updated in lockstep.
describe("life sim enum drift guards", () => {
  it("TIME_SLOTS matches docs/product/daily-life-sim.md", () => {
    expect([...TIME_SLOTS]).toEqual(["morning", "afternoon", "evening", "night"]);
  });

  it("MOODS matches docs/product/daily-life-sim.md", () => {
    expect([...MOODS]).toEqual(["calm", "busy", "lonely", "playful", "guarded", "tired"]);
  });

  it("AVAILABILITIES matches docs/product/daily-life-sim.md", () => {
    expect([...AVAILABILITIES]).toEqual(["available", "busy", "away"]);
  });

  it("ACTIVITY_TYPES covers all 6 v1 activities", () => {
    expect([...ACTIVITY_TYPES]).toEqual([
      "check_in",
      "hang_out",
      "invite",
      "date",
      "gift",
      "repair",
    ]);
  });

  it("ACTIVITY_STATUSES is the 3-state lifecycle", () => {
    expect([...ACTIVITY_STATUSES]).toEqual(["active", "completed", "canceled"]);
  });

  it("MEMORY_TYPES covers the 7 milestone categories", () => {
    expect([...MEMORY_TYPES]).toEqual([
      "first_meeting",
      "first_hangout",
      "first_date",
      "gift_received",
      "confession",
      "repair",
      "anniversary",
    ]);
  });

  it("RELATIONSHIP_STAGES covers positive + negative stages", () => {
    expect([...RELATIONSHIP_STAGES]).toEqual([
      "first_contact",
      "familiar",
      "trusted",
      "close_friend",
      "romantic_tension",
      "dating",
      "committed",
      "strained",
      "hostile",
      "estranged",
    ]);
  });
});
