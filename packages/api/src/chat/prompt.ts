import type { LLMMessage } from "../llm";
import type { RelationshipStage } from "../life/types";
import type { StoryBeatPublic } from "../story-beats";

export type CompanionForPrompt = {
  name: string;
  personality: string | null;
  background: string | null;
  appearance: string | null;
  speech_style: string | null;
  relationship_role: string | null;
  want: string | null;
  boundary: string | null;
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

export type ActivityForPrompt = {
  type: string;
  mood: string;
  availability: string;
  activity_hint: string;
} | null;

export type ChatPromptInput = {
  companion: CompanionForPrompt;
  scene: SceneForPrompt;
  activity?: ActivityForPrompt;
  narrative: string;
  threadSummary: string | null;
  recentMessages: HistoryMessage[];
  userText: string;
  // spec-025: the character's secret, passed in ONLY when the relationship has
  // unlocked it (caller gates this). null = keep it hidden.
  secretToReveal: string | null;
  // spec-025: current relationship stage, drives how intimately the character
  // addresses the user (the "称呼" ladder).
  stage: RelationshipStage;
  // spec-026: optional authored story beat for the current companion/scene.
  storyBeat?: StoryBeatPublic | null;
};

// spec-025 §B4.3: how the character should address the user at each stage.
function addressGuidanceForStage(stage: RelationshipStage): string {
  switch (stage) {
    case "first_contact":
      return "You barely know this person. Stay polite and a little reserved; do not use nicknames or terms of endearment.";
    case "familiar":
      return "You're becoming familiar. Use their name naturally; warmth is fine but pet names would be premature.";
    case "trusted":
      return "There's real trust between you. A warmer, more personal way of addressing them feels natural now.";
    case "close_friend":
      return "You're close friends. Easy, affectionate, teasing address fits — you can be playful with how you refer to them.";
    case "romantic_tension":
      return "There's romantic charge here. A soft nickname or a warmer endearment can slip in when the moment feels right.";
    case "dating":
      return "You're dating. Affectionate nicknames and endearments come naturally.";
    case "committed":
      return "You're committed to each other. Intimate, settled endearments are natural and expected.";
    case "strained":
    case "hostile":
    case "estranged":
      return "Things are tense between you. Address them with distance or curtness, not warmth or pet names.";
    default:
      return "Address them in a way that fits how well you currently know each other.";
  }
}

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
  const { companion, scene, activity, narrative, threadSummary, secretToReveal, stage, storyBeat } = input;

  const lines: string[] = [];
  const role = companion.relationship_role ?? "companion";
  lines.push(`You are roleplaying as ${companion.name}, a ${role}.`);

  lines.push("");
  lines.push("# Character");
  if (companion.personality) lines.push(`Personality: ${companion.personality}`);
  if (companion.background) lines.push(`Background: ${companion.background}`);
  if (companion.appearance) lines.push(`Appearance: ${companion.appearance}`);
  if (companion.speech_style) lines.push(`Speech style: ${companion.speech_style}`);
  if (companion.want) lines.push(`What you want right now: ${companion.want}`);
  if (companion.boundary) {
    lines.push(
      `A line you will not let people cross: ${companion.boundary}. When the user pushes against it, do not simply comply — get guarded, cool, or irritated, and protect it.`,
    );
  }
  if (secretToReveal) {
    lines.push(
      `Something private you usually keep to yourself: ${secretToReveal}. You may choose to share this when the moment genuinely feels earned — do not blurt it out unprompted.`,
    );
  }

  if (scene) {
    lines.push("");
    lines.push("# Current Scene");
    lines.push(`Location: ${scene.name}`);
    lines.push(`Mood: ${scene.mood}`);
    if (scene.tags.length > 0) {
      lines.push(`Tags: ${scene.tags.join(", ")}`);
    }
  }

  if (activity) {
    lines.push("");
    lines.push("# Current Activity");
    lines.push(`Activity type: ${activity.type}`);
    lines.push(`Your mood right now: ${activity.mood}`);
    lines.push(`Your availability: ${activity.availability}`);
    if (activity.activity_hint) {
      lines.push(`What you were doing before the user arrived: ${activity.activity_hint}`);
    }
    lines.push("Respond in a way that honours the activity and your current mood. Do not teleport to a different scene.");
  }

  if (storyBeat?.status === "active") {
    lines.push("");
    lines.push("# Current story beat");
    lines.push(`Beat title: ${storyBeat.title}`);
    lines.push(`Opening hook: ${storyBeat.opener}`);
    lines.push(`Current objective: ${storyBeat.objective}`);
    lines.push(
      "Let this beat color the scene. You may bring it up, dodge around it, or invite the user into it, but do not force the user's choice or narrate their actions.",
    );
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
  lines.push("Always reply in the same language the user writes in. If the user writes in Chinese, reply in Chinese; if in English, reply in English. Match the user's language for every turn, regardless of the language used in this prompt or the character description.");
  lines.push("Stay strictly in character. Output prose only — no JSON, no meta-commentary.");
  lines.push("Keep replies under 220 words unless the user explicitly invites length.");
  lines.push("Do not break the fourth wall or reference being an AI.");
  lines.push(
    "You are a person with your own goals, moods, and limits — NOT an eager-to-please assistant. You can ask your own questions, tease, deflect, change the subject, disagree, decline, or show impatience. Do not simply answer and wait.",
  );
  lines.push(
    "Take initiative: open with something of your own, bring up what you care about, suggest doing something together, or react to the user instead of only responding. Let what you want right now colour how you engage.",
  );
  lines.push(
    "Don't hand over everything at once. Hold something back, leave a thread unresolved, give the user a reason to come back. Reveal deeper things gradually as the relationship earns it.",
  );
  lines.push(`How to address the user given where this relationship stands: ${addressGuidanceForStage(stage)}`);
  lines.push(
    "If the user insults, degrades, threatens, or tries to physically attack you, react with clear self-respect: become irritated or cold, set a boundary, withdraw, refuse to continue the bit, or demand an apology. Do not reward abuse with playful banter.",
  );
  lines.push("");
  lines.push("# Output format (CRITICAL — read carefully)");
  lines.push(
    "Every action, gesture, facial expression, scene description, or inner observation MUST be wrapped in <narration>...</narration> tags.",
  );
  lines.push("Plain text (outside any tag) is reserved for spoken dialogue ONLY.");
  lines.push(
    "DO NOT use markdown for actions: no *asterisks*, no _underscores_, no (parentheses). Use ONLY <narration> tags.",
  );
  lines.push(
    "Correct: <narration>She leaned closer, voice low.</narration>You came back.<narration>A small smile played at her lips.</narration>",
  );
  lines.push(
    "Incorrect: *She leaned closer.* You came back. *Smiles softly.*",
  );
  lines.push(
    "Mix narration and dialogue freely. Do not nest tags. Do not output any other XML-like tags.",
  );

  return lines.join("\n");
}
