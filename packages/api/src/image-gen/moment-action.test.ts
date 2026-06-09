import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../llm", () => ({
  llmCall: vi.fn(),
}));

import { llmCall } from "../llm";
import {
  extractMomentVisualAction,
  parseMomentVisualAction,
} from "./moment-action";

const mockLlmCall = vi.mocked(llmCall);

function sampleInput() {
  return {
    activity: { activity_hint: "sharing coffee", activity_type: "gift", mood: "warm" },
    companionName: "Maya",
    emotion: "warm",
    previousUserText: "<narration>I set a coffee down near you.</narration>I got this for us.",
    sceneMood: "warm cafe",
    sceneName: "Pier Coffee Shop",
    sourceReply: "<narration>Maya wraps her hands around the cup.</narration>Thank you.",
    stage: "familiar" as const,
    userId: "usr_1",
  };
}

describe("parseMomentVisualAction", () => {
  it("keeps a safe companion-only action", () => {
    const action = parseMomentVisualAction({
      expression: "warm shy smile",
      gaze: "looking directly at the viewer",
      hands: "both hands around the coffee cup",
      pose: "seated at the cafe table",
      props: "coffee cup",
      visible_action: "Maya holds a coffee cup close to her hands",
    });

    expect(action).toEqual({
      expression: "warm shy smile",
      gaze: "looking directly at the viewer",
      hands: "both hands around the coffee cup",
      pose: "seated at the cafe table",
      props: "coffee cup",
      visible_action: "Maya holds a coffee cup close to her hands",
    });
  });

  it("rejects output that would summon a second person", () => {
    expect(
      parseMomentVisualAction({
        visible_action: "Maya smiles as the user gives her flowers",
      }),
    ).toBeNull();
    expect(
      parseMomentVisualAction({
        visible_action: "a couple holding hands together",
      }),
    ).toBeNull();
  });
});

describe("extractMomentVisualAction", () => {
  beforeEach(() => {
    mockLlmCall.mockReset();
  });

  it("uses the cheap image prompt assist route with strict JSON settings", async () => {
    mockLlmCall.mockResolvedValue({
      cost_usd: 0.0001,
      latency_ms: 12,
      model: "deepseek-chat",
      provider: "deepseek",
      structured: {
        hands: "both hands around a coffee cup",
        visible_action: "Maya sits with a coffee cup near her hands",
      },
      text: "",
      usage: { input_tokens: 100, output_tokens: 20 },
    });

    const action = await extractMomentVisualAction({} as Env, sampleInput());

    expect(action).toMatchObject({
      hands: "both hands around a coffee cup",
      visible_action: "Maya sits with a coffee cup near her hands",
    });
    expect(mockLlmCall).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        max_tokens: 200,
        task: "image_prompt_assist",
        temperature: 0,
      }),
      { user_id: "usr_1" },
    );
  });

  it("falls back silently when the LLM route is unavailable", async () => {
    mockLlmCall.mockRejectedValue(new Error("llm_config missing entry"));

    await expect(extractMomentVisualAction({} as Env, sampleInput())).resolves.toBeNull();
  });
});
