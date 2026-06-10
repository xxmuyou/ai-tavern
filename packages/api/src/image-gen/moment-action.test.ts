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
      body_pose: "seated alone at the cafe table",
      expression: "warm shy smile",
      gaze: "looking directly at the viewer",
      hand_action: "both hands around the coffee cup",
      outfit: "cozy knit sweater and jeans",
      held_or_nearby_props: "coffee cup",
      scene_position: "near the window",
    });

    expect(action).toEqual({
      body_pose: "seated alone at the cafe table",
      expression: "warm shy smile",
      gaze: "looking directly at the viewer",
      hand_action: "both hands around the coffee cup",
      outfit: "cozy knit sweater and jeans",
      held_or_nearby_props: "coffee cup",
      scene_position: "near the window",
    });
  });

  it("keeps a scene-appropriate outfit without tripping the multi-subject guard", () => {
    expect(
      parseMomentVisualAction({
        body_pose: "standing alone on the warm sand",
        outfit: "light summer dress",
      }),
    ).toEqual({
      body_pose: "standing alone on the warm sand",
      outfit: "light summer dress",
    });
  });

  it("cleans empty optional fields", () => {
    expect(
      parseMomentVisualAction({
        body_pose: "standing alone near the doorway",
        expression: "",
        gaze: "  ",
        hand_action: "",
      }),
    ).toEqual({
      body_pose: "standing alone near the doorway",
    });
  });

  it("rejects output that would summon a second person", () => {
    expect(
      parseMomentVisualAction({
        body_pose: "Maya smiles as the user gives her flowers",
      }),
    ).toBeNull();
    expect(
      parseMomentVisualAction({
        body_pose: "a couple holding hands together",
      }),
    ).toBeNull();
  });

  it("rejects unsafe intimate or duplicate-body wording", () => {
    for (const body_pose of [
      "Maya slides off the viewer's lap",
      "Maya leans into an embrace",
      "Maya prepares for a kiss",
      "Maya is held by someone",
      "Maya is visible in a reflection of another person",
      "Maya has a duplicate body behind her",
    ]) {
      expect(parseMomentVisualAction({ body_pose })).toBeNull();
    }
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
        body_pose: "Maya sits alone at the cafe table",
        hand_action: "both hands around a coffee cup",
      },
      text: "",
      usage: { input_tokens: 100, output_tokens: 20 },
    });

    const action = await extractMomentVisualAction({} as Env, sampleInput());

    expect(action).toMatchObject({
      body_pose: "Maya sits alone at the cafe table",
      hand_action: "both hands around a coffee cup",
    });
    expect(mockLlmCall).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        max_tokens: 200,
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining("pose-and-styling planner"),
            role: "system",
          }),
          expect.objectContaining({
            content: expect.stringContaining(
              "Plan a safe solo pose and a scene-appropriate outfit for the companion",
            ),
            role: "user",
          }),
        ]),
        task: "image_prompt_assist",
        temperature: 0,
      }),
      { user_id: "usr_1" },
    );

    const request = mockLlmCall.mock.calls[0]?.[1] as {
      messages: Array<{ content: string; role: string }>;
    };
    expect(request.messages[0]?.content).toContain("receiving flowers becomes");
    expect(request.messages[0]?.content).toContain("receiving coffee becomes");
    expect(request.messages[0]?.content).toContain("leaving someone's lap or bed contact becomes");
  });

  it("falls back silently when the LLM route is unavailable", async () => {
    mockLlmCall.mockRejectedValue(new Error("llm_config missing entry"));

    await expect(extractMomentVisualAction({} as Env, sampleInput())).resolves.toBeNull();
  });
});
