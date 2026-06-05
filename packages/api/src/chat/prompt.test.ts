import { describe, expect, it } from "vitest";

import { buildChatPrompt, buildChatPromptArtifacts } from "./prompt";

const companion = {
  appearance: "tall, kind eyes",
  background: "barista who paints",
  boundary: "being rushed or treated as a backup option",
  name: "Maya",
  personality: "warm and curious",
  relationship_role: "friend",
  speech_style: "casual, witty",
  want: "to be taken seriously as an artist",
};

const scene = {
  mood: "rainy afternoon, cozy",
  name: "Pier Coffee Shop",
  tags: ["cafe", "rainy"],
};

describe("buildChatPrompt", () => {
  it("includes companion name, scene mood, narrative and the user text", () => {
    const messages = buildChatPrompt({
      companion,
      narrative: "You think of them as a Friend.\nYou trust them.",
      recentMessages: [],
      scene,
      secretToReveal: null,
      stage: "trusted",
      threadSummary: null,
      userText: "Hey, what are you reading?",
    });

    expect(messages[0]?.role).toBe("system");
    const system = messages[0]?.content ?? "";
    expect(system).toContain("Maya");
    expect(system).toContain("friend");
    expect(system).toContain("Pier Coffee Shop");
    expect(system).toContain("rainy afternoon");
    expect(system).toContain("You trust them.");
    expect(system).toContain("Stay strictly in character");
    // spec-025: want + boundary are always injected.
    expect(system).toContain("to be taken seriously as an artist");
    expect(system).toContain("being rushed or treated as a backup option");

    expect(messages.at(-1)).toEqual({
      content: "Hey, what are you reading?",
      role: "user",
    });
  });

  it("maps history user/companion roles to user/assistant", () => {
    const messages = buildChatPrompt({
      companion,
      narrative: "Stranger.",
      recentMessages: [
        { content: "Hi", role: "user" },
        { content: "Hey there.", role: "companion" },
        { content: "How's your day?", role: "user" },
      ],
      scene: null,
      secretToReveal: null,
      stage: "first_contact",
      threadSummary: null,
      userText: "Want to grab coffee later?",
    });

    expect(messages.length).toBe(6);
    expect(messages[1]).toEqual({ content: "Hi", role: "user" });
    expect(messages[2]).toEqual({ content: "Hey there.", role: "assistant" });
    expect(messages[3]).toEqual({ content: "How's your day?", role: "user" });
    expect(messages[4]?.role).toBe("system");
    expect(messages[4]?.content).toContain("Final guard before replying");
    expect(messages[5]).toEqual({ content: "Want to grab coffee later?", role: "user" });
  });

  it("omits the scene section when scene is null", () => {
    const messages = buildChatPrompt({
      companion,
      narrative: "Stranger.",
      recentMessages: [],
      scene: null,
      secretToReveal: null,
      stage: "first_contact",
      threadSummary: null,
      userText: "hi",
    });
    expect(messages[0]?.content).not.toContain("# Current Scene");
  });

  it("includes thread summary when provided", () => {
    const messages = buildChatPrompt({
      companion,
      narrative: "Friend.",
      recentMessages: [],
      scene: null,
      secretToReveal: null,
      stage: "trusted",
      threadSummary: "You bonded over a shared love of late-night walks.",
      userText: "hi",
    });
    expect(messages[0]?.content).toContain("Conversation summary so far");
    expect(messages[0]?.content).toContain("late-night walks");
  });

  it("injects the secret only when one is provided to reveal", () => {
    const base = {
      companion,
      narrative: "Trusted.",
      recentMessages: [],
      scene: null,
      stage: "trusted" as const,
      threadSummary: null,
      userText: "hi",
    };

    const locked = buildChatPrompt({ ...base, secretToReveal: null });
    expect(locked[0]?.content).not.toContain("usually keep to yourself");

    const revealed = buildChatPrompt({
      ...base,
      secretToReveal: "her last show was cancelled and it gutted her",
    });
    expect(revealed[0]?.content).toContain("her last show was cancelled and it gutted her");
  });

  it("injects the user persona when one is provided", () => {
    const base = {
      companion,
      narrative: "Friend.",
      recentMessages: [],
      scene: null,
      secretToReveal: null,
      stage: "trusted" as const,
      threadSummary: null,
      userText: "hi",
    };

    const without = buildChatPrompt(base);
    expect(without[0]?.content).not.toContain("# Who you are talking to");

    const withPersona = buildChatPrompt({
      ...base,
      userPersona: {
        description: "a night-shift ER nurse who hides exhaustion behind jokes",
        gender: "female",
        name: "Dr. Wen",
      },
    });
    const system = withPersona[0]?.content ?? "";
    expect(system).toContain("# Who you are talking to");
    expect(system).toContain("Dr. Wen");
    expect(system).toContain("night-shift ER nurse");
    expect(system).toContain("female");
  });

  it("injects example dialogue lines as voice anchors when provided", () => {
    const base = {
      companion,
      narrative: "Friend.",
      recentMessages: [],
      scene: null,
      secretToReveal: null,
      stage: "trusted" as const,
      threadSummary: null,
      userText: "hi",
    };

    const without = buildChatPrompt(base);
    expect(without[0]?.content).not.toContain("# How you speak");

    const withExamples = buildChatPrompt({
      ...base,
      exampleDialogues: ["Oh, it's you again. Sit. I'll pretend I'm not glad.", "Don't make it weird."],
    });
    const system = withExamples[0]?.content ?? "";
    expect(system).toContain("# How you speak (examples of your voice)");
    expect(system).toContain("pretend I'm not glad");
    expect(system).toContain("Don't make it weird");
  });

  it("varies how the character is told to address the user by stage", () => {
    const early = buildChatPrompt({
      companion,
      narrative: "New.",
      recentMessages: [],
      scene: null,
      secretToReveal: null,
      stage: "first_contact",
      threadSummary: null,
      userText: "hi",
    });
    expect(early[0]?.content).toContain("barely know");

    const committed = buildChatPrompt({
      companion,
      narrative: "Together.",
      recentMessages: [],
      scene: null,
      secretToReveal: null,
      stage: "committed",
      threadSummary: null,
      userText: "hi",
    });
    expect(committed[0]?.content).toContain("committed");
  });

  it("injects thread memory and post-history guard as auditable segments", () => {
    const artifacts = buildChatPromptArtifacts({
      companion,
      narrative: "Trusted.",
      recentMessages: [{ content: "old promise", role: "user" }],
      scene: null,
      secretToReveal: null,
      stage: "trusted",
      threadMemories: [
        {
          content: "Maya promised to show Dr. Wen her unfinished painting next time.",
          id: "mem-1",
          importance: 90,
          kind: "promise",
          updated_at: 10,
        },
      ],
      threadSummary: null,
      userText: "你还记得吗？",
    });

    const memorySegment = artifacts.segments.find((segment) => segment.id === "thread_memory");
    expect(memorySegment?.included).toBe(true);
    expect(memorySegment?.content).toContain("unfinished painting");

    const guardIndex = artifacts.messages.findIndex((message) => message.content.includes("Final guard before replying"));
    expect(guardIndex).toBe(2);
    expect(artifacts.messages.at(-1)).toEqual({ content: "你还记得吗？", role: "user" });
  });

  it("keeps required identity and output format segments when budget trims history", () => {
    const artifacts = buildChatPromptArtifacts({
      companion,
      narrative: "Trusted.",
      recentMessages: [
        { content: "A very old turn that should be cut when budget is tiny.", role: "user" },
        { content: "Another old turn that should also be cut.", role: "companion" },
      ],
      scene,
      secretToReveal: null,
      stage: "trusted",
      threadMemories: [
        {
          content: "Low importance detail.",
          id: "mem-low",
          importance: 1,
          kind: "open_loop",
          updated_at: 1,
        },
      ],
      threadSummary: "A longish summary that is less important than required identity and format.",
      tokenBudget: 20,
      userText: "hi",
    });

    expect(artifacts.segments.find((segment) => segment.id === "core_identity")?.included).toBe(true);
    expect(artifacts.segments.find((segment) => segment.id === "output_format")?.included).toBe(true);
    expect(artifacts.segments.find((segment) => segment.id === "post_history_guard")?.included).toBe(true);
    expect(artifacts.segments.some((segment) => segment.id.startsWith("recent_history") && segment.trimReason === "budget")).toBe(true);
  });
});
