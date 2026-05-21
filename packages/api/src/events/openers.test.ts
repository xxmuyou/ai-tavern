import { describe, expect, it } from "vitest";

import { GENERIC_OPENER_COUNT, pickOpener } from "./openers";

describe("pickOpener", () => {
  it("is stable for one user, companion, scene, and day", () => {
    const args = {
      companionId: "maya",
      companionName: "Maya",
      now: 1_700_000_000_000,
      sceneId: "cafe",
      sceneName: "Cafe",
      userId: "u-1",
    };

    expect(pickOpener(args)).toBe(pickOpener(args));
  });

  it("keeps a useful generic pool", () => {
    expect(GENERIC_OPENER_COUNT).toBeGreaterThanOrEqual(20);
    expect(pickOpener({
      companionId: "maya",
      companionName: "Maya",
      now: 1,
      sceneId: "cafe",
      sceneName: "Cafe",
      userId: "u-1",
    })).toContain("Maya");
  });
});
