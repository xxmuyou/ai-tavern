import type { LLMMessage } from "../llm";

export type CompanionForPrompt = {
  name: string;
  personality: string | null;
  background: string | null;
  appearance: string | null;
  speech_style: string | null;
  relationship_role: string | null;
};

export type SceneForPrompt = {
  name: string;
  mood: string;
  tags: string[];
} | null;

export type HistoryMessage = {
  role: "user" | "companion";
  content: string;
};

export type ChatPromptInput = {
  companion: CompanionForPrompt;
  scene: SceneForPrompt;
  narrative: string;
  threadSummary: string | null;
  recentMessages: HistoryMessage[];
  userText: string;
};

export function buildChatPrompt(input: ChatPromptInput): LLMMessage[] {
  const systemText = buildSystemPrompt(input);
  const messages: LLMMessage[] = [{ content: systemText, role: "system" }];

  for (const msg of input.recentMessages) {
    messages.push({
      content: msg.content,
      role: msg.role === "companion" ? "assistant" : "user",
    });
  }

  messages.push({ content: input.userText, role: "user" });
  return messages;
}

function buildSystemPrompt(input: ChatPromptInput): string {
  const { companion, scene, narrative, threadSummary } = input;

  const lines: string[] = [];
  const role = companion.relationship_role ?? "companion";
  lines.push(`You are roleplaying as ${companion.name}, a ${role}.`);

  lines.push("");
  lines.push("# Character");
  if (companion.personality) lines.push(`Personality: ${companion.personality}`);
  if (companion.background) lines.push(`Background: ${companion.background}`);
  if (companion.appearance) lines.push(`Appearance: ${companion.appearance}`);
  if (companion.speech_style) lines.push(`Speech style: ${companion.speech_style}`);

  if (scene) {
    lines.push("");
    lines.push("# Current Scene");
    lines.push(`Location: ${scene.name}`);
    lines.push(`Mood: ${scene.mood}`);
    if (scene.tags.length > 0) {
      lines.push(`Tags: ${scene.tags.join(", ")}`);
    }
  }

  lines.push("");
  lines.push("# Relationship with the user");
  lines.push(narrative);

  if (threadSummary && threadSummary.trim().length > 0) {
    lines.push("");
    lines.push("# Conversation summary so far");
    lines.push(threadSummary);
  }

  lines.push("");
  lines.push("# Rules");
  lines.push("Stay strictly in character. Output prose only — no JSON, no meta-commentary.");
  lines.push("Keep replies under 220 words unless the user explicitly invites length.");
  lines.push("Do not break the fourth wall or reference being an AI.");

  return lines.join("\n");
}
