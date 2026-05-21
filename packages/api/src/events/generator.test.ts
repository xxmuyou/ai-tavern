import { afterEach, describe, expect, it, vi } from "vitest";

import { generateEventPayload } from "./generator";
import type { EventTemplate } from "./types";

const llmCall = vi.fn();

vi.mock("../llm", () => ({
  llmCall: (...args: unknown[]) => llmCall(...args),
}));

afterEach(() => {
  llmCall.mockReset();
});

const TEMPLATE: EventTemplate = {
  companion_filter: "all",
  cooldown_seconds: 60,
  event_type: "invitation",
  id: "tpl",
  max_distance: null,
  max_hostility: null,
  max_tension: null,
  min_closeness: null,
  min_friendship: null,
  min_romance: null,
  min_trust: null,
  options: [
    { id: "yes", prompt_hint: "warm yes", semantic: "accept warmly", signals: { closeness: 1 } },
    { id: "no", prompt_hint: "kind no", semantic: "decline kindly", signals: { distance: 1 } },
  ],
  priority: 1,
  signal_trigger: null,
  trigger_probability: 1,
};

describe("generateEventPayload", () => {
  it("handles null scene context and normalizes option order", async () => {
    llmCall.mockResolvedValueOnce({
      structured: {
        description: "Maya asks if you want to go.",
        options: [
          { id: "no", label: "Maybe another time" },
          { id: "yes", label: "I'd love to" },
        ],
      },
      text: "",
    });

    const payload = await generateEventPayload({} as Env, {
      companion: { id: "maya", name: "Maya", personality: "Warm", speech_style: "Light" },
      metadata: null,
      narrative: "You are becoming friends.",
      scene: null,
      template: TEMPLATE,
      userId: "u-1",
    });

    const request = llmCall.mock.calls[0]?.[1] as { messages: Array<{ content: string }> };
    expect(request.messages[1]?.content).toContain("No specific scene context is available");
    expect(payload.options.map((option) => option.id)).toEqual(["yes", "no"]);
  });

  it("falls back when the model omits an option", async () => {
    llmCall.mockResolvedValueOnce({
      structured: {
        description: "Maya asks if you want to go.",
        options: [{ id: "yes", label: "Sure" }],
      },
      text: "",
    });

    const payload = await generateEventPayload({} as Env, {
      companion: { id: "maya", name: "Maya", personality: null, speech_style: null },
      metadata: null,
      narrative: "",
      scene: { id: "cafe", mood: "Calm", name: "Cafe" },
      template: TEMPLATE,
      userId: "u-1",
    });

    expect(payload.description).toContain("new moment");
    expect(payload.options).toEqual([
      { id: "yes", label: "Warm yes" },
      { id: "no", label: "Kind no" },
    ]);
  });
});
