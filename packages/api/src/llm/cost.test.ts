import { describe, expect, it } from "vitest";

import { estimateCost, PRICING } from "./cost";

describe("estimateCost", () => {
  it("computes deepseek-chat cost from per-million prices", () => {
    const cost = estimateCost("deepseek", "deepseek-chat", {
      input_tokens: 2000,
      output_tokens: 300,
    });
    // input: 2000 * 0.14 / 1M = 0.00028
    // output: 300 * 0.28 / 1M = 0.000084
    // total: 0.000364
    expect(cost).toBeCloseTo(0.000364, 6);
  });

  it("computes gpt-4o-mini cost", () => {
    const cost = estimateCost("openai", "gpt-4o-mini", {
      input_tokens: 2000,
      output_tokens: 300,
    });
    // 2000 * 0.15 + 300 * 0.6 = 480 micro-dollars = 0.00048
    expect(cost).toBeCloseTo(0.00048, 6);
  });

  it("returns 0 for unknown provider/model combos", () => {
    expect(estimateCost("openai", "unknown-model", { input_tokens: 100, output_tokens: 100 })).toBe(0);
  });

  it("includes all configured DeepSeek / OpenAI defaults", () => {
    expect(PRICING).toHaveProperty("deepseek:deepseek-chat");
    expect(PRICING).toHaveProperty("openai:gpt-4o-mini");
  });
});
