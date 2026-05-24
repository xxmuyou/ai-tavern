import { describe, expect, it } from "vitest";

import { ZERO_DIMENSIONS } from "../relationships/level";
import { applyHostilityOverride, assessHostileInput } from "./hostility";
import type { SignalExtractResult } from "./signal-extract";

describe("hostile input handling", () => {
  it("classifies direct insults and threats as severe", () => {
    const result = assessHostileInput("傻逼，我弄死你");

    expect(result.severity).toBe("severe");
    expect(result.emotion).toBe("annoyed");
    expect(result.triggerConflict).toBe(true);
    expect(result.signals).toMatchObject({
      distance: 2,
      hostility: 3,
      tension: 2,
      trust: -2,
    });
  });

  it("does not classify normal disagreement as hostile", () => {
    const result = assessHostileInput("I disagree with your decision.");

    expect(result.severity).toBe("none");
    expect(result.triggerConflict).toBe(false);
    expect(result.signals).toEqual({});
  });

  it("overrides overly warm LLM signal extraction for hostile input", () => {
    const extracted: SignalExtractResult = {
      cost_usd: 0,
      emotion: "warm",
      ok: true,
      signals: {
        ...ZERO_DIMENSIONS,
        closeness: 1,
        friendship: 1,
        trust: 1,
      },
    };

    const result = applyHostilityOverride(extracted, assessHostileInput("操你妈，单挑"));

    expect(result.emotion).toBe("annoyed");
    expect(result.signals).toMatchObject({
      closeness: -2,
      friendship: -2,
      hostility: 3,
      tension: 2,
      trust: -2,
    });
  });
});
