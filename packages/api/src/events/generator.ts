import { llmCall } from "../llm";
import type { DimensionValues } from "../relationships/level";
import type { CompanionForPrompt, EventPayload, EventTemplate, SceneForPrompt } from "./types";

const EVENT_SCHEMA = {
  additionalProperties: false,
  properties: {
    description: { type: "string" },
    options: {
      items: {
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          label: { type: "string" },
        },
        required: ["id", "label"],
        type: "object",
      },
      type: "array",
    },
  },
  required: ["description", "options"],
  type: "object",
};

export async function generateEventPayload(
  env: Env,
  args: {
    userId: string;
    companion: CompanionForPrompt;
    scene: SceneForPrompt | null;
    narrative: string;
    template: EventTemplate;
    metadata: Record<string, unknown> | null;
  },
): Promise<EventPayload> {
  try {
    const response = await llmCall(
      env,
      {
        json_schema: EVENT_SCHEMA,
        max_tokens: 400,
        messages: [
          { content: buildEventSystemPrompt(), role: "system" },
          { content: buildEventUserPrompt(args), role: "user" },
        ],
        task: "character-assist",
        temperature: 0.7,
      },
      { user_id: args.userId },
    );
    return normalizePayload(response.structured ?? response.text, args.template);
  } catch {
    return fallbackPayload(args.template);
  }
}

export async function generateResolutionDescription(
  env: Env,
  args: {
    userId: string;
    companion: CompanionForPrompt;
    eventPayload: EventPayload;
    chosenOption: { id: string; label: string };
    signals: Partial<DimensionValues>;
  },
): Promise<string> {
  try {
    const response = await llmCall(
      env,
      {
        max_tokens: 150,
        messages: [
          {
            content: "Write one concise third-person sentence describing the companion's immediate reaction.",
            role: "system",
          },
          {
            content: [
              `Companion: ${args.companion.name}`,
              `Personality: ${args.companion.personality ?? "unspecified"}`,
              `Event: ${args.eventPayload.description}`,
              `User chose: ${args.chosenOption.label}`,
              `Signals applied: ${JSON.stringify(args.signals)}`,
            ].join("\n"),
            role: "user",
          },
        ],
        task: "character-assist",
        temperature: 0.7,
      },
      { user_id: args.userId },
    );
    const text = response.text.trim();
    return text || fallbackResolution(args.companion.name, args.chosenOption.label);
  } catch {
    return fallbackResolution(args.companion.name, args.chosenOption.label);
  }
}

function buildEventSystemPrompt(): string {
  return [
    "You generate short interactive narrative events for a relationship RPG.",
    "Return only JSON matching the schema.",
    "Descriptions are neutral third-person narration.",
    "Option labels are first-person responses from the user's point of view.",
  ].join("\n");
}

function buildEventUserPrompt(args: {
  companion: CompanionForPrompt;
  scene: SceneForPrompt | null;
  narrative: string;
  template: EventTemplate;
  metadata: Record<string, unknown> | null;
}): string {
  const sceneText = args.scene
    ? `${args.scene.name}: ${args.scene.mood}`
    : "No specific scene context is available.";
  const metadataText = args.metadata ? `\n# Event metadata\n${JSON.stringify(args.metadata)}` : "";
  const optionsText = args.template.options
    .map((option) => `- ${option.id}: ${option.semantic}; hint: ${option.prompt_hint}`)
    .join("\n");

  return [
    `Event type: ${args.template.event_type}`,
    "",
    "# Character",
    `Name: ${args.companion.name}`,
    `Personality: ${args.companion.personality ?? "unspecified"}`,
    `Speech style: ${args.companion.speech_style ?? "unspecified"}`,
    "",
    "# Scene",
    sceneText,
    "",
    "# Relationship narrative",
    args.narrative,
    metadataText,
    "",
    "# Required options, preserve ids",
    optionsText,
  ].join("\n");
}

function normalizePayload(raw: unknown, template: EventTemplate): EventPayload {
  const parsed = typeof raw === "string" ? safeParse(raw) : raw;
  if (!isRecord(parsed)) return fallbackPayload(template);

  const description = typeof parsed.description === "string" ? parsed.description.trim() : "";
  if (!Array.isArray(parsed.options) || !description) {
    return fallbackPayload(template);
  }

  const labelsById = new Map<string, string>();
  for (const item of parsed.options) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.label !== "string") {
      return fallbackPayload(template);
    }
    if (labelsById.has(item.id)) return fallbackPayload(template);
    labelsById.set(item.id, item.label.trim());
  }

  const options: Array<{ id: string; label: string }> = [];
  for (const option of template.options) {
    const label = labelsById.get(option.id);
    if (!label) return fallbackPayload(template);
    options.push({ id: option.id, label });
  }
  if (labelsById.size !== template.options.length) {
    return fallbackPayload(template);
  }

  return {
    description,
    options,
  };
}

function fallbackPayload(template: EventTemplate): EventPayload {
  return {
    description: fallbackDescription(template.event_type),
    options: template.options.map((option) => ({
      id: option.id,
      label: titleCase(option.prompt_hint),
    })),
  };
}

function fallbackDescription(eventType: string): string {
  switch (eventType) {
    case "conflict":
      return "The moment turns tense, and a response is needed.";
    case "confession":
      return "An honest feeling rises to the surface, asking for an answer.";
    case "gift":
      return "A small gesture is offered, carrying more meaning than it first appears.";
    case "milestone":
      return "The relationship reaches a moment worth acknowledging.";
    default:
      return "A new moment opens between you, waiting for your response.";
  }
}

function fallbackResolution(companionName: string, label: string): string {
  return `You chose "${label}". ${companionName} takes a moment to respond.`;
}

function titleCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "Respond";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
