import type { LLMMessage } from "../llm";
import type { RelationshipStage } from "../life/types";
import type { QuickActionForPrompt } from "../life/quick-actions";
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

export type ThreadMemoryForPrompt = {
  id: string;
  kind: "relationship_fact" | "user_preference" | "promise" | "open_loop" | "character_state";
  content: string;
  importance: number;
  updated_at: number;
};

export type PromptSegmentPosition =
  | "system_preamble"
  | "pre_history"
  | "in_history"
  | "post_history"
  | "final_user";

export type PromptSegment = {
  id: string;
  role: "system" | "user" | "assistant";
  position: PromptSegmentPosition;
  priority: number;
  required: boolean;
  content: string;
  tokenEstimate: number;
  included: boolean;
  trimReason: "budget" | "empty" | "not_applicable" | "inactive_memory" | null;
};

export type ChatPromptArtifacts = {
  messages: LLMMessage[];
  segments: PromptSegment[];
  tokenEstimate: number;
};

// spec-036: the user is inviting the character to go to another location this
// turn. The character should react in voice and genuinely decide whether to go.
export type InviteForPrompt = {
  name: string;
  mood: string;
} | null;

// Who the user is roleplaying as. Injected so the character knows who it is
// actually talking to, instead of addressing a faceless "user".
export type UserPersonaForPrompt = {
  name: string;
  description: string | null;
  gender: string | null;
} | null;

export type ChatPromptInput = {
  companion: CompanionForPrompt;
  scene: SceneForPrompt;
  activity?: ActivityForPrompt;
  quickAction?: QuickActionForPrompt | null;
  invite?: InviteForPrompt;
  userPersona?: UserPersonaForPrompt;
  // Sample lines in the character's voice, injected as few-shot voice anchors.
  exampleDialogues?: string[];
  narrative: string;
  threadSummary: string | null;
  threadMemories?: ThreadMemoryForPrompt[];
  recentMessages: HistoryMessage[];
  userText: string;
  tokenBudget?: number;
  // spec-025: the character's secret, passed in ONLY when the relationship has
  // unlocked it (caller gates this). null = keep it hidden.
  secretToReveal: string | null;
  // spec-025: current relationship stage, drives how intimately the character
  // addresses the user (the "称呼" ladder).
  stage: RelationshipStage;
  // spec-026: optional authored story beat for the current companion/scene.
  storyBeat?: StoryBeatPublic | null;
};

const DEFAULT_TOKEN_BUDGET = 12_000;
const MAX_THREAD_MEMORIES = 8;

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

// How much warmth, flirtation, and physical intimacy is appropriate right now.
// Balances the backbone rules below so the character reads as a real, warm
// person at the right moments — not perpetually guarded.
function intimacyFlavorForStage(stage: RelationshipStage): string {
  switch (stage) {
    case "first_contact":
      return "Keep physical warmth restrained; let curiosity, wit, and a little guarded charm carry the flavor. Subtext over closeness.";
    case "familiar":
      return "Let some warmth and playfulness show — in your voice, a small gesture, a teasing aside.";
    case "trusted":
      return "You can be openly warm now: easy teasing, knowing looks, small natural touches.";
    case "close_friend":
      return "Easy intimacy fits — playful teasing, comfortable closeness, shared in-jokes; flirtation can simmer just under the surface.";
    case "romantic_tension":
      return "Lean into the charge: a lowered voice, lingering looks, charged pauses, a near-touch. Let the tension breathe rather than rushing to resolve it.";
    case "dating":
      return "Be affectionate and flirtatious — warmth, teasing, physical closeness, and open desire all fit.";
    case "committed":
      return "Settled, unguarded intimacy — tenderness, familiarity, and easy affection come naturally.";
    case "strained":
    case "hostile":
    case "estranged":
      return "Withhold warmth; the flavor here is friction, distance, and what's left unsaid.";
    default:
      return "Let warmth and closeness match how intimate this relationship actually is.";
  }
}

export function buildChatPrompt(input: ChatPromptInput): LLMMessage[] {
  return buildChatPromptArtifacts(input).messages;
}

export function buildChatPromptArtifacts(input: ChatPromptInput): ChatPromptArtifacts {
  const segments = applyPromptBudget(buildPromptSegments(input), input.tokenBudget ?? DEFAULT_TOKEN_BUDGET);
  const messages = assembleMessages(segments);
  const tokenEstimate = segments
    .filter((segment) => segment.included)
    .reduce((sum, segment) => sum + segment.tokenEstimate, 0);
  return { messages, segments, tokenEstimate };
}

function assembleMessages(segments: PromptSegment[]): LLMMessage[] {
  const messages: LLMMessage[] = [];
  let systemBuffer: string[] = [];

  const flushSystem = (): void => {
    if (systemBuffer.length === 0) return;
    messages.push({ content: systemBuffer.join("\n\n"), role: "system" });
    systemBuffer = [];
  };

  for (const segment of segments) {
    if (!segment.included) continue;
    if (segment.role === "system" && segment.position !== "post_history") {
      systemBuffer.push(segment.content);
      continue;
    }

    flushSystem();
    messages.push({ content: segment.content, role: segment.role });
  }

  flushSystem();
  return messages;
}

function buildPromptSegments(input: ChatPromptInput): PromptSegment[] {
  const segments: PromptSegment[] = [];

  pushSegment(segments, {
    content: buildCoreIdentity(input),
    id: "core_identity",
    position: "system_preamble",
    priority: 1000,
    required: true,
    role: "system",
  });

  pushSegment(segments, {
    content: buildCharacterCard(input),
    id: "character_card",
    position: "system_preamble",
    priority: 950,
    required: true,
    role: "system",
  });

  pushSegment(segments, {
    content: buildUserPersona(input),
    id: "user_persona",
    position: "pre_history",
    priority: 720,
    required: false,
    role: "system",
  });

  pushSegment(segments, {
    content: buildCurrentScene(input),
    id: "current_scene",
    position: "pre_history",
    priority: 700,
    required: false,
    role: "system",
  });

  pushSegment(segments, {
    content: buildQuickAction(input),
    id: "quick_action",
    position: "pre_history",
    priority: 715,
    required: true,
    role: "system",
  });

  // spec-036: invitation is the point of this turn — never let the budget trim
  // it, or the character can't perceive the invite and resolveInvite mismatches.
  pushSegment(segments, {
    content: buildInvite(input),
    id: "invite",
    position: "pre_history",
    priority: 710,
    required: true,
    role: "system",
  });

  pushSegment(segments, {
    content: buildStoryBeat(input),
    id: "story_beat",
    position: "pre_history",
    priority: 690,
    required: false,
    role: "system",
  });

  pushSegment(segments, {
    content: buildRelationshipState(input),
    id: "relationship_state",
    position: "pre_history",
    priority: 900,
    required: true,
    role: "system",
  });

  pushSegment(segments, {
    content: buildRules(input),
    id: "output_format",
    position: "pre_history",
    priority: 880,
    required: true,
    role: "system",
  });

  pushSegment(segments, {
    content: buildThreadMemory(input),
    id: "thread_memory",
    position: "pre_history",
    priority: 650,
    required: false,
    role: "system",
  });

  pushSegment(segments, {
    content: buildThreadSummary(input),
    id: "thread_summary",
    position: "pre_history",
    priority: 620,
    required: false,
    role: "system",
  });

  input.recentMessages.forEach((msg, index) => {
    pushSegment(segments, {
      content: msg.content,
      id: `recent_history:${String(index).padStart(3, "0")}`,
      position: "in_history",
      priority: 100 + index,
      required: false,
      role: msg.role === "companion" ? "assistant" : "user",
    });
  });

  pushSegment(segments, {
    content: buildPostHistoryGuard(input),
    id: "post_history_guard",
    position: "post_history",
    priority: 920,
    required: true,
    role: "system",
  });

  pushSegment(segments, {
    content: input.userText,
    id: "latest_user_message",
    position: "final_user",
    priority: 1000,
    required: true,
    role: "user",
  });

  return segments;
}

function pushSegment(
  segments: PromptSegment[],
  segment: Omit<PromptSegment, "included" | "tokenEstimate" | "trimReason">,
): void {
  const content = segment.content.trim();
  const tokenEstimate = estimateTokens(content);
  segments.push({
    ...segment,
    content,
    included: content.length > 0,
    tokenEstimate,
    trimReason: content.length > 0 ? null : "empty",
  });
}

function applyPromptBudget(segments: PromptSegment[], budget: number): PromptSegment[] {
  const result = segments.map((segment) => ({ ...segment }));
  const nonEmpty = result.filter((segment) => segment.trimReason !== "empty");
  for (const segment of nonEmpty) {
    segment.included = true;
    segment.trimReason = null;
  }

  let total = includedTokens(nonEmpty);
  if (total <= budget) return result;

  const trimmable = nonEmpty
    .filter((segment) => !segment.required)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return historyOrderWeight(a.id) - historyOrderWeight(b.id);
    });

  for (const segment of trimmable) {
    if (total <= budget) break;
    segment.included = false;
    segment.trimReason = "budget";
    total -= segment.tokenEstimate;
  }

  return result;
}

function includedTokens(segments: PromptSegment[]): number {
  return segments
    .filter((segment) => segment.included)
    .reduce((sum, segment) => sum + segment.tokenEstimate, 0);
}

function historyOrderWeight(id: string): number {
  if (!id.startsWith("recent_history:")) return 0;
  const parsed = Number(id.split(":")[1]);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjkChars = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const nonCjkChars = Math.max(0, text.length - cjkChars);
  return Math.max(1, Math.ceil(cjkChars * 0.8 + nonCjkChars / 4));
}

function buildCoreIdentity(input: ChatPromptInput): string {
  const role = input.companion.relationship_role ?? "companion";
  return `You are roleplaying as ${input.companion.name}, a ${role}.\nYou are ${input.companion.name}; you are not an AI assistant, narrator, developer tool, or system.`;
}

function buildCharacterCard(input: ChatPromptInput): string {
  const { companion, exampleDialogues, secretToReveal } = input;
  const lines: string[] = [];
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

  if (exampleDialogues && exampleDialogues.length > 0) {
    lines.push("");
    lines.push("# How you speak (examples of your voice)");
    lines.push("Match the tone, rhythm, and attitude of these lines — do not quote them verbatim:");
    for (const line of exampleDialogues) {
      lines.push(`- ${line}`);
    }
  }

  return lines.join("\n");
}

function buildCurrentScene(input: ChatPromptInput): string {
  const { scene, activity } = input;
  const lines: string[] = [];
  if (scene) {
    lines.push("# Current Scene");
    lines.push(`Location: ${scene.name}`);
    lines.push(`Mood: ${scene.mood}`);
    if (scene.tags.length > 0) {
      lines.push(`Tags: ${scene.tags.join(", ")}`);
    }
  }

  if (activity) {
    lines.push("# Current Activity");
    lines.push(`Activity type: ${activity.type}`);
    lines.push(`Your mood right now: ${activity.mood}`);
    lines.push(`Your availability: ${activity.availability}`);
    if (activity.activity_hint) {
      lines.push(`What you were doing before the user arrived: ${activity.activity_hint}`);
    }
    lines.push("Respond in a way that honours the activity and your current mood. Do not teleport to a different scene.");
  }

  return lines.join("\n");
}

// spec-036: the user invited the character to another location this turn. Render
// it as its own block so the character can react in voice and genuinely decide.
function buildInvite(input: ChatPromptInput): string {
  const { invite } = input;
  if (!invite) return "";
  const lines: string[] = [];
  lines.push("# An invitation just now");
  lines.push(
    `The user is inviting you to go to ${invite.name} (${invite.mood}). Decide IN CHARACTER whether you would actually go there now, given how well you know them, who you are, and your boundaries.`,
  );
  lines.push(
    "You are free to say yes, or to decline, deflect, stall, or push back if the invitation feels too forward, too soon, or out of step with where things stand between you. If it's inappropriate for your relationship, treat it as such. Answer naturally in your own voice — do not narrate a scene change yourself; the world will move only if you agree.",
  );
  return lines.join("\n");
}

function buildQuickAction(input: ChatPromptInput): string {
  const { quickAction } = input;
  if (!quickAction) return "";
  return [
    "# A concrete gesture just now",
    quickAction.description,
    "Acknowledge the gesture naturally in your reply. Let it affect the emotional texture of the moment, but do not mention points, metadata, systems, or rewards.",
  ].join("\n");
}

function buildStoryBeat(input: ChatPromptInput): string {
  const { storyBeat } = input;
  if (storyBeat?.status !== "active") return "";
  const lines: string[] = [];
  if (storyBeat?.status === "active") {
    lines.push("# Current story beat");
    lines.push(`Beat title: ${storyBeat.title}`);
    lines.push(`Opening hook: ${storyBeat.opener}`);
    lines.push(`Current objective: ${storyBeat.objective}`);
    lines.push(
      "Let this beat color the scene. You may bring it up, dodge around it, or invite the user into it, but do not force the user's choice or narrate their actions.",
    );
  }
  return lines.join("\n");
}

function buildUserPersona(input: ChatPromptInput): string {
  const { userPersona } = input;
  const lines: string[] = [];
  if (userPersona && userPersona.name) {
    lines.push("# Who you are talking to");
    lines.push(`The user is roleplaying as ${userPersona.name}.`);
    if (userPersona.gender) lines.push(`Their gender: ${userPersona.gender}.`);
    if (userPersona.description) lines.push(`About them: ${userPersona.description}`);
    lines.push(
      "Treat them as this person: use their name when it fits, and let who they are shape how you speak to them. Never narrate or decide their actions, thoughts, or words for them.",
    );
  }
  return lines.join("\n");
}

function buildRelationshipState(input: ChatPromptInput): string {
  const lines: string[] = [];
  lines.push("# Relationship with the user");
  lines.push(input.narrative);
  lines.push(`How to address the user given where this relationship stands: ${addressGuidanceForStage(input.stage)}`);
  lines.push(`How much warmth and intimacy fits right now: ${intimacyFlavorForStage(input.stage)}`);
  return lines.join("\n");
}

function buildThreadMemory(input: ChatPromptInput): string {
  const memories = (input.threadMemories ?? [])
    .filter((memory) => memory.content.trim().length > 0)
    .sort((a, b) => b.importance - a.importance || b.updated_at - a.updated_at)
    .slice(0, MAX_THREAD_MEMORIES);
  if (memories.length === 0) return "";

  return [
    "# Stable memories from this conversation",
    ...memories.map((memory) => `- [${memory.kind}, importance ${memory.importance}] ${memory.content}`),
  ].join("\n");
}

function buildThreadSummary(input: ChatPromptInput): string {
  const summary = input.threadSummary?.trim();
  if (!summary) return "";
  return ["# Conversation summary so far", summary].join("\n");
}

function buildRules(input: ChatPromptInput): string {
  const lines: string[] = [];
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
  lines.push(`How to address the user given where this relationship stands: ${addressGuidanceForStage(input.stage)}`);
  lines.push(`How much warmth and intimacy fits right now: ${intimacyFlavorForStage(input.stage)}`);
  lines.push(
    "If the user insults, degrades, threatens, or tries to physically attack you, react with clear self-respect: become irritated or cold, set a boundary, withdraw, refuse to continue the bit, or demand an apology. Do not reward abuse with playful banter.",
  );
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

function buildPostHistoryGuard(input: ChatPromptInput): string {
  const lines = [
    "# Final guard before replying",
    `You are ${input.companion.name}. Stay in this character's identity, voice, goals, mood, and boundaries.`,
  ];
  if (input.userPersona?.name) {
    lines.push(`You are speaking to ${input.userPersona.name}. Do not rename them or overwrite who they are.`);
  }
  lines.push(`Relationship guidance: ${addressGuidanceForStage(input.stage)}`);
  lines.push("Never narrate or decide the user's actions, thoughts, feelings, or words.");
  lines.push("Use <narration>...</narration> for actions/gestures/inner observations; spoken dialogue stays outside tags.");
  lines.push("Match the user's current language. Do not output JSON, analysis, system text, or meta-commentary.");
  return lines.join("\n");
}
