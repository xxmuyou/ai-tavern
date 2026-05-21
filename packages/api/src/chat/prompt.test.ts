import { describe, expect, it } from "vitest";

import { buildChatPrompt } from "./prompt";

const companion = {
  appearance: "tall, kind eyes",
  background: "barista who paints",
  name: "Maya",
  personality: "warm and curious",
  relationship_role: "friend",
  speech_style: "casual, witty",
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
      threadSummary: null,
      userText: "Want to grab coffee later?",
    });

    expect(messages.length).toBe(5);
    expect(messages[1]).toEqual({ content: "Hi", role: "user" });
    expect(messages[2]).toEqual({ content: "Hey there.", role: "assistant" });
    expect(messages[3]).toEqual({ content: "How's your day?", role: "user" });
    expect(messages[4]).toEqual({ content: "Want to grab coffee later?", role: "user" });
  });

  it("omits the scene section when scene is null", () => {
    const messages = buildChatPrompt({
      companion,
      narrative: "Stranger.",
      recentMessages: [],
      scene: null,
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
      threadSummary: "You bonded over a shared love of late-night walks.",
      userText: "hi",
    });
    expect(messages[0]?.content).toContain("Conversation summary so far");
    expect(messages[0]?.content).toContain("late-night walks");
  });
});
