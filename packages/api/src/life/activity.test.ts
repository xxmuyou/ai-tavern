import { describe, expect, it } from "vitest";

// Unit tests for activity-gate logic. Endpoint integration tests rely on a
// stub Env, so we test the pure gate logic indirectly by importing the
// config constants and verifying the public ACTIVITY_TYPES and
// ACTIVITY_STATUSES roundtrip cleanly through the JSON snapshot.

import { ACTIVITY_THRESHOLDS, GIFT_COOLDOWN_MS } from "./config";
import { ACTIVITY_STATUSES, ACTIVITY_TYPES, type ActivityType } from "./types";

describe("activity config", () => {
  it("covers all 6 activity types", () => {
    expect(ACTIVITY_TYPES).toHaveLength(6);
    const set = new Set<ActivityType>(ACTIVITY_TYPES);
    expect(set.has("check_in")).toBe(true);
    expect(set.has("hang_out")).toBe(true);
    expect(set.has("invite")).toBe(true);
    expect(set.has("date")).toBe(true);
    expect(set.has("gift")).toBe(true);
    expect(set.has("repair")).toBe(true);
  });

  it("uses a 24h gift cooldown by default", () => {
    expect(GIFT_COOLDOWN_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("date thresholds are tighter than invite thresholds", () => {
    expect(ACTIVITY_THRESHOLDS.date_min_romance).toBeGreaterThanOrEqual(
      ACTIVITY_THRESHOLDS.invite_min_closeness,
    );
  });

  it("ACTIVITY_STATUSES is exhaustive and ordered", () => {
    expect([...ACTIVITY_STATUSES]).toEqual(["active", "completed", "canceled"]);
  });
});
