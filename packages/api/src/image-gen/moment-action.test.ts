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
    companionId: "maya",
    companionGender: "female",
    companionName: "Maya",
    emotion: "warm",
    previousUserText: "<narration>You set a coffee down nearby.</narration>I got this for us.",
    sceneMood: "warm cafe",
    sceneName: "Pier Coffee Shop",
    scenePrivacy: "public" as const,
    sceneTags: ["cafe", "waterfront", "warm", "day"],
    sceneVenue: "dining" as const,
    sourceReply: "<narration>Maya wraps her hands around the cup.</narration>Thank you.",
    stage: "familiar" as const,
    userId: "usr_1",
  };
}

function llmResponse(structured: Record<string, unknown>) {
  return {
    cost_usd: 0.0001,
    latency_ms: 12,
    model: "deepseek-chat",
    provider: "deepseek" as const,
    structured,
    text: "",
    usage: { input_tokens: 100, output_tokens: 20 },
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

  it("keeps hairstyle and makeup fields", () => {
    expect(
      parseMomentVisualAction({
        body_pose: "standing alone near the bar counter",
        hairstyle: "glamorous styled curls",
        makeup: "smoky eyes with red lips",
        outfit: "off-shoulder bodycon party dress",
      }),
    ).toEqual({
      body_pose: "standing alone near the bar counter",
      hairstyle: "glamorous styled curls",
      makeup: "smoky eyes with red lips",
      outfit: "off-shoulder bodycon party dress",
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
        hairstyle: "",
        hand_action: "",
        makeup: "   ",
      }),
    ).toEqual({
      body_pose: "standing alone near the doorway",
    });
  });

  it("truncates overlong styling fields to 120 characters", () => {
    const action = parseMomentVisualAction({
      body_pose: "standing alone",
      hairstyle: "x".repeat(200),
    });
    expect(action?.hairstyle).toHaveLength(120);
  });

  it("truncates overlong body poses to 120 characters", () => {
    const action = parseMomentVisualAction({
      body_pose: "x".repeat(220),
    });
    expect(action?.body_pose).toHaveLength(120);
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
    expect(
      parseMomentVisualAction({
        body_pose: "standing alone",
        hairstyle: "hair styled together with someone",
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
    mockLlmCall.mockResolvedValue(
      llmResponse({
        body_pose: "Maya sits alone at the cafe table",
        hairstyle: "soft curled hair",
        hand_action: "both hands around a coffee cup",
        outfit: "stylish fitted midi dress",
      }),
    );

    const action = await extractMomentVisualAction({} as Env, sampleInput());

    expect(action).toMatchObject({
      body_pose: "Maya sits alone at the cafe table",
      hairstyle: "soft curled hair",
      outfit: "stylish fitted midi dress",
    });
    expect(mockLlmCall).toHaveBeenCalledTimes(1);
    expect(mockLlmCall).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        max_tokens: 260,
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining("pose-and-styling planner"),
            role: "system",
          }),
          expect.objectContaining({
            content: expect.stringContaining(
              "choosing from the pose, expression, and outfit candidates",
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
    const system = request.messages[0]?.content ?? "";
    expect(system).toContain("receiving flowers becomes");
    expect(system).toContain("receiving coffee includes a cup only if this turn clearly mentions it");
    expect(system).toContain("Props are optional");
    expect(system).toContain("omit props when unclear");
    expect(system).toContain("body_pose must be 120 characters or less");
    // The restyle mandate, the nudity ceiling and the fixed-background rule.
    expect(system).toContain("Always restyle");
    expect(system).not.toContain("Pose quality:");
    expect(system).toContain("never nude");
    expect(system).toContain("The background location is fixed");

    const user = request.messages[1]?.content ?? "";
    expect(user).toContain("Companion gender: female");
    expect(user).toContain("Style profile: sharp urban");
    expect(user).toContain("Scene tags: cafe, waterfront, warm, day");
    expect(user).toContain("Venue type: dining; setting: public");
    expect(user).toContain("Styling boldness:");
    expect(user).toContain("no sleepwear"); // familiar -> reserved tier guidance
    expect(user).toContain("Pose candidates:");
    expect(user).toContain("full-body seated sideways at a cafe table");
    expect(user).toContain("Expression candidates:");
    expect(user).toContain("soft genuine smile");
    expect(user).not.toContain("Body attitude modifier:");
    expect(user).not.toContain("Scene prop hints");
    expect(user).not.toContain("coffee cup");
    expect(user).toContain("Outfit candidates:");
    expect(user).toContain("fitted blouse with a high-waisted short skirt and sheer stockings");
    expect(user).not.toContain("Pose/body quality:");
    expect(user).toContain("Keep body_pose <= 120 chars");
    expect(user).toContain("Props are optional");
  });

  it("retries once with a nudge and higher temperature when the first attempt errors", async () => {
    mockLlmCall
      .mockRejectedValueOnce(new Error("llm_config missing entry"))
      .mockResolvedValueOnce(
        llmResponse({
          body_pose: "standing alone by the window",
          hairstyle: "loose curled hair",
          outfit: "flowy short dress",
        }),
      );

    const action = await extractMomentVisualAction({} as Env, sampleInput());

    expect(action).toMatchObject({ body_pose: "standing alone by the window" });
    expect(mockLlmCall).toHaveBeenCalledTimes(2);
    const retry = mockLlmCall.mock.calls[1]?.[1] as {
      messages: Array<{ content: string; role: string }>;
      temperature: number;
    };
    expect(retry.temperature).toBe(0.5);
    expect(retry.messages).toHaveLength(3);
    expect(retry.messages[2]?.content).toContain("previous answer was rejected");
  });

  it("retries when the first output trips the multi-subject guard", async () => {
    mockLlmCall
      .mockResolvedValueOnce(
        llmResponse({ body_pose: "Maya sits on the user's lap" }),
      )
      .mockResolvedValueOnce(
        llmResponse({
          body_pose: "seated alone at the bed edge",
          hairstyle: "soft tousled hair",
          outfit: "elegant silk slip nightdress",
        }),
      );

    const action = await extractMomentVisualAction({} as Env, sampleInput());

    expect(action).toMatchObject({ body_pose: "seated alone at the bed edge" });
    expect(mockLlmCall).toHaveBeenCalledTimes(2);
  });

  it("returns null after both attempts fail", async () => {
    mockLlmCall.mockRejectedValue(new Error("llm_config missing entry"));

    await expect(extractMomentVisualAction({} as Env, sampleInput())).resolves.toBeNull();
    expect(mockLlmCall).toHaveBeenCalledTimes(2);
  });
});
