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
      body_pose: "seated relaxed pose, face toward viewer",
      camera_view: "side-view table-side composition",
      expression: "warm shy smile",
      outfit: "cozy knit sweater and jeans",
      prop_name: "coffee cup",
      prop_state: "nearby",
    });

    expect(action).toEqual({
      body_pose: "seated relaxed pose, face toward viewer",
      camera_view: "side-view table-side composition",
      expression: "warm shy smile",
      outfit: "cozy knit sweater and jeans",
      prop_name: "coffee cup",
      prop_state: "nearby",
    });
  });

  it("defaults clear props to nearby and ignores old free-form hand fields", () => {
    expect(
      parseMomentVisualAction({
        body_pose: "seated relaxed pose, face toward viewer",
        camera_view: "high-angle table-side view",
        hand_action: "both hands around the coffee cup",
        held_or_nearby_props: "coffee cup",
        outfit: "cozy knit sweater and jeans",
        prop_name: "iced americano glass",
      }),
    ).toEqual({
      body_pose: "seated relaxed pose, face toward viewer",
      camera_view: "high-angle table-side view",
      outfit: "cozy knit sweater and jeans",
      prop_name: "iced americano glass",
      prop_state: "nearby",
    });
  });

  it("supports single-frame prop states for drink narration", () => {
    expect(
      parseMomentVisualAction({
        body_pose: "seated slight forward lean, torso angled toward viewer",
        camera_view: "side-view table-side composition",
        expression: "lazy appraising gaze, curious eyes, relaxed mouth",
        outfit: "fitted knit mini dress",
        prop_name: "cold glass",
        prop_state: "just_set_down",
      }),
    ).toEqual({
      body_pose: "seated slight forward lean, torso angled toward viewer",
      camera_view: "side-view table-side composition",
      expression: "lazy appraising gaze, curious eyes, relaxed mouth",
      outfit: "fitted knit mini dress",
      prop_name: "cold glass",
      prop_state: "just_set_down",
    });

    expect(
      parseMomentVisualAction({
        body_pose: "seated slight forward lean, torso angled toward viewer",
        camera_view: "side-view table-side composition",
        outfit: "fitted knit mini dress",
        prop_name: "cold glass",
        prop_state: "near_lips",
      }),
    ).toMatchObject({ prop_state: "near_lips" });
  });

  it("maps legacy prop_relation values for old internal callers", () => {
    expect(
      parseMomentVisualAction({
        body_pose: "seated relaxed pose, face toward viewer",
        camera_view: "side-view table-side composition",
        outfit: "cozy knit sweater and jeans",
        prop_name: "small bouquet",
        prop_relation: "held_in_one_hand",
      }),
    ).toMatchObject({
      prop_name: "small bouquet",
      prop_state: "held_one_hand",
    });
  });

  it("keeps hairstyle and makeup fields", () => {
    expect(
      parseMomentVisualAction({
        body_pose: "standing three-quarter pose, face toward viewer",
        hairstyle: "glamorous styled curls",
        makeup: "smoky eyes with red lips",
        outfit: "off-shoulder bodycon party dress",
      }),
    ).toEqual({
      body_pose: "standing three-quarter pose, face toward viewer",
      hairstyle: "glamorous styled curls",
      makeup: "smoky eyes with red lips",
      outfit: "off-shoulder bodycon party dress",
    });
  });

  it("rejects camera_view pollution and visible device wording", () => {
    expect(
      parseMomentVisualAction({
        body_pose: "seated relaxed pose, face toward viewer",
        camera_view: "low-angle view from below eye level",
        outfit: "cozy knit sweater and jeans",
      }),
    ).toMatchObject({
      body_pose: "seated relaxed pose, face toward viewer",
      camera_view: "low-angle view from below eye level",
    });
    for (const camera_view of [
      "under-table view",
      "visible camera in frame",
      "selfie phone view",
      "side-view with coffee cup",
      "low-angle view with teasing smile",
      "seated side-view composition",
    ]) {
      expect(
        parseMomentVisualAction({
          body_pose: "seated relaxed pose, face toward viewer",
          camera_view,
          outfit: "cozy knit sweater and jeans",
        }),
      ).toBeNull();
    }
  });

  it("keeps a scene-appropriate outfit without tripping the multi-subject guard", () => {
    expect(
      parseMomentVisualAction({
        body_pose: "standing three-quarter pose, face toward viewer",
        outfit: "light summer dress",
      }),
    ).toEqual({
      body_pose: "standing three-quarter pose, face toward viewer",
      outfit: "light summer dress",
    });
  });

  it("cleans empty optional fields", () => {
    expect(
      parseMomentVisualAction({
        body_pose: "standing three-quarter pose, face toward viewer",
        expression: "",
        hairstyle: "",
        makeup: "   ",
      }),
    ).toEqual({
      body_pose: "standing three-quarter pose, face toward viewer",
    });
  });

  it("truncates overlong styling fields to 120 characters", () => {
    const action = parseMomentVisualAction({
      body_pose: "standing alone",
      hairstyle: "x".repeat(200),
    });
    expect(action?.hairstyle).toHaveLength(120);
  });

  it("truncates overlong body poses to 100 characters", () => {
    const action = parseMomentVisualAction({
      body_pose: "x".repeat(220),
    });
    expect(action?.body_pose).toHaveLength(100);
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

  it("rejects or drops slot-contaminated prop and hand wording", () => {
    expect(
      parseMomentVisualAction({
        body_pose: "seated relaxed pose, face toward viewer, one hand near cup",
        outfit: "cozy knit sweater and jeans",
      }),
    ).toBeNull();
    expect(
      parseMomentVisualAction({
        body_pose: "seated relaxed pose, face toward viewer",
        outfit: "cozy knit sweater and jeans",
        prop_name: "fingers wrapped around a cold glass of iced americano",
        prop_state: "held_one_hand",
      }),
    ).toEqual({
      body_pose: "seated relaxed pose, face toward viewer",
      outfit: "cozy knit sweater and jeans",
    });
    expect(
      parseMomentVisualAction({
        body_pose: "seated relaxed pose, face toward viewer",
        expression: "warm smile with both hands around the cup",
        outfit: "cozy knit sweater and jeans",
      }),
    ).toBeNull();
    expect(
      parseMomentVisualAction({
        body_pose: "seated relaxed pose, face toward viewer",
        expression: "warm smile",
        outfit: "flowy dress holding a bouquet",
      }),
    ).toBeNull();
  });

  it("rejects scene objects and framing words inside body_pose", () => {
    for (const body_pose of [
      "full-body seated relaxed pose, face toward viewer",
      "seated beside a cafe table, face toward viewer",
      "leaning against the counter, face toward viewer",
      "standing near the doorway, face toward viewer",
      "walking along the shoreline, face toward viewer",
      "reclining on a sofa, face toward viewer",
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
        body_pose: "expressive seated turn, face toward viewer",
        camera_view: "side-view table-side composition",
        hairstyle: "soft curled hair",
        outfit: "stylish fitted midi dress",
        prop_name: "coffee cup",
        prop_state: "nearby",
      }),
    );

    const action = await extractMomentVisualAction({} as Env, sampleInput());

    expect(action).toMatchObject({
      body_pose: "expressive seated turn, face toward viewer",
      camera_view: "side-view table-side composition",
      hairstyle: "soft curled hair",
      outfit: "stylish fitted midi dress",
    });
    expect(mockLlmCall).toHaveBeenCalledTimes(1);
    expect(mockLlmCall).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        json_schema: expect.objectContaining({
          properties: expect.not.objectContaining({
            hand_action: expect.anything(),
            held_or_nearby_props: expect.anything(),
            prop_relation: expect.anything(),
          }),
          required: expect.arrayContaining(["body_pose", "camera_view", "outfit", "hairstyle"]),
        }),
        max_tokens: 300,
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining("pose-and-styling planner"),
            role: "system",
          }),
          expect.objectContaining({
            content: expect.stringContaining(
              "Extract body_pose from the companion reply narration first",
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
    expect(system).toContain("Derive body_pose from the companion reply narration first");
    expect(system).toContain(
      "rewrite it into a clearer, more expressive anime-style solo body pose",
    );
    expect(system).toContain("Props are optional");
    expect(system).toContain("omit props when unclear");
    expect(system).toContain("body_pose describes only body structure and direction");
    expect(system).toContain("Choose one camera_view from the venue-safe candidates");
    expect(system).toContain("camera_view describes only viewpoint and composition");
    expect(system).toContain("Avoid repeating plain eye-level front view");
    expect(system).toContain("expression facial only");
    expect(system).toContain("outfit clothing-only");
    expect(system).toContain("Choose ONE primary visual moment");
    expect(system).toContain("Prefer the last emotionally meaningful stable moment");
    expect(system).toContain("Use prop_state nearby, held_one_hand, near_lips, or just_set_down");
    expect(system).toContain("Prefer nearby or just_set_down");
    expect(system).toContain("Never write hand_action");
    expect(system).toContain("body_pose and camera_view must be 100 characters or less");
    expect(system).toContain("never mention full-body");
    expect(system).toContain("tables, counters, chairs");
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
    expect(user).toContain("Fallback pose family");
    expect(user).toContain("standing three-quarter pose, face toward viewer");
    expect(user).not.toContain("full-body seated sideways at a cafe table");
    expect(user).toContain("Camera view candidates:");
    expect(user).toContain("side-view table-side composition");
    expect(user).toContain("high-angle table-side view");
    expect(user).not.toContain("under-table");
    expect(user).not.toContain("floor-level");
    expect(user).toContain("Expression candidates:");
    expect(user).toContain("soft genuine smile");
    expect(user).not.toContain("Body attitude modifier:");
    expect(user).not.toContain("Scene prop hints");
    expect(user).not.toContain("coffee cup");
    expect(user).toContain("Outfit candidates:");
    expect(user).toContain("fitted blouse with a high-waisted short skirt and sheer stockings");
    expect(user).not.toContain("Pose/body quality:");
    expect(user).toContain("Keep body_pose and camera_view <= 100 chars");
    expect(user).toContain("camera_view <= 100 chars");
    expect(user).toContain("Use fallback pose family only when narration has no drawable body action");
    expect(user).toContain("Props are optional");
    expect(user).toContain("prop_name + prop_state");
  });

  it("extracts drink narration as one stable visual moment instead of a standing fallback", async () => {
    mockLlmCall.mockResolvedValue(
      llmResponse({
        body_pose: "seated slight forward lean, torso angled toward viewer",
        camera_view: "side-view table-side composition",
        expression: "lazy appraising gaze, curious eyes, relaxed mouth",
        hairstyle: "neat half-up hairstyle",
        outfit: "fitted knit mini dress with sheer stockings",
        prop_name: "cold glass",
        prop_state: "just_set_down",
      }),
    );

    const action = await extractMomentVisualAction({} as Env, {
      ...sampleInput(),
      sourceReply:
        "Mika's fingers wrapped around the cold glass, condensation bleeding onto the wooden table. She lifted it, took a measured sip, and set it down with a soft click.\n\nHer eyes flicked to his cup, then to his face, appraising with lazy curiosity.",
    });

    expect(action).toMatchObject({
      body_pose: "seated slight forward lean, torso angled toward viewer",
      camera_view: "side-view table-side composition",
      expression: "lazy appraising gaze, curious eyes, relaxed mouth",
      prop_name: "cold glass",
      prop_state: "just_set_down",
    });
    expect(action?.body_pose).not.toMatch(/\b(glass|table|hand|finger|hold|standing)\b/i);

    const request = mockLlmCall.mock.calls[0]?.[1] as {
      messages: Array<{ content: string; role: string }>;
    };
    expect(request.messages[1]?.content).toContain("Pick one primary visual moment");
    expect(request.messages[1]?.content).toContain("last emotionally meaningful stable action");
  });

  it("retries once with a nudge and higher temperature when the first attempt errors", async () => {
    mockLlmCall
      .mockRejectedValueOnce(new Error("llm_config missing entry"))
      .mockResolvedValueOnce(
        llmResponse({
          body_pose: "standing three-quarter pose, face toward viewer",
          camera_view: "front three-quarter view, medium angled shot",
          hairstyle: "loose curled hair",
          outfit: "flowy short dress",
        }),
      );

    const action = await extractMomentVisualAction({} as Env, sampleInput());

    expect(action).toMatchObject({ body_pose: "standing three-quarter pose, face toward viewer" });
    expect(mockLlmCall).toHaveBeenCalledTimes(2);
    const retry = mockLlmCall.mock.calls[1]?.[1] as {
      messages: Array<{ content: string; role: string }>;
      temperature: number;
    };
    expect(retry.temperature).toBe(0.5);
    expect(retry.messages).toHaveLength(3);
    expect(retry.messages[2]?.content).toContain("previous answer was rejected");
    expect(retry.messages[2]?.content).toContain("body_pose included hands, props, cups, glasses, tables");
    expect(retry.messages[2]?.content).toContain("pure body structure and direction only");
  });

  it("retries when the first output trips the multi-subject guard", async () => {
    mockLlmCall
      .mockResolvedValueOnce(
        llmResponse({ body_pose: "Maya sits on the user's lap" }),
      )
      .mockResolvedValueOnce(
        llmResponse({
          body_pose: "seated relaxed pose, face toward viewer",
          camera_view: "side-view table-side composition",
          hairstyle: "soft tousled hair",
          outfit: "elegant silk slip nightdress",
        }),
      );

    const action = await extractMomentVisualAction({} as Env, sampleInput());

    expect(action).toMatchObject({ body_pose: "seated relaxed pose, face toward viewer" });
    expect(mockLlmCall).toHaveBeenCalledTimes(2);
  });

  it("returns null after both attempts fail", async () => {
    mockLlmCall.mockRejectedValue(new Error("llm_config missing entry"));

    await expect(extractMomentVisualAction({} as Env, sampleInput())).resolves.toBeNull();
    expect(mockLlmCall).toHaveBeenCalledTimes(2);
  });
});
