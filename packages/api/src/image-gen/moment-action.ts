import { llmCall, type LLMMessage } from "../llm";
import type { RelationshipStage } from "../life/types";

export type MomentVisualAction = {
  visible_action: string;
  pose?: string;
  hands?: string;
  gaze?: string;
  expression?: string;
  props?: string;
};

export type ExtractMomentVisualActionInput = {
  userId: string;
  companionName: string;
  previousUserText: string | null;
  sourceReply: string;
  sceneName: string;
  sceneMood: string;
  activity: { activity_type: string; activity_hint: string; mood: string } | null;
  emotion: string | null;
  stage: RelationshipStage;
};

const ACTION_SCHEMA: Record<string, unknown> = {
  additionalProperties: false,
  properties: {
    expression: { type: "string" },
    gaze: { type: "string" },
    hands: { type: "string" },
    pose: { type: "string" },
    props: { type: "string" },
    visible_action: { type: "string" },
  },
  required: ["visible_action"],
  type: "object",
};

const RISKY_MULTI_SUBJECT_PATTERN =
  /\b(user|another person|second person|two people|2 people|couple|crowd|bystander|bystanders|someone|somebody|opponent|people|we|us|our|together)\b/i;

const ACTION_SYSTEM_PROMPT =
  "You are a visual action extractor for a single-character image generator. " +
  "Your job is not to summarize the chat. Convert the current turn into a drawable action for the companion only. " +
  "Output one JSON object with visible_action and optional pose, hands, gaze, expression, props. " +
  "Every field must describe exactly one visible person: the companion. The viewer may be implied but must not be visible. " +
  "Never mention the user, another person, a second person, a couple, a crowd, bystanders, or anyone else. " +
  "Translate user actions into the companion's single-person reaction: flowers become the companion holding flowers; coffee becomes a cup near the companion's hands; invitations become the companion turning toward the viewer near the doorway. " +
  "For intimate interactions, use viewer-facing single-person actions such as reaching one hand slightly toward the viewer or leaning closer while looking at the viewer.";

function buildUserPrompt(input: ExtractMomentVisualActionInput): string {
  const activity = input.activity
    ? `${input.activity.activity_type}, ${input.activity.activity_hint}, ${input.activity.mood}`
    : "none";
  return [
    `Companion: ${input.companionName}`,
    `Scene: ${input.sceneName}, ${input.sceneMood}`,
    `Relationship stage: ${input.stage}`,
    `Emotion: ${input.emotion ?? "neutral"}`,
    `Activity: ${activity}`,
    `Previous user message: ${input.previousUserText ?? "(none)"}`,
    `Companion reply: ${input.sourceReply}`,
    "",
    "Return JSON only. Keep each field short and concrete. Use English image-description wording.",
  ].join("\n");
}

export async function extractMomentVisualAction(
  env: Env,
  input: ExtractMomentVisualActionInput,
): Promise<MomentVisualAction | null> {
  const messages: LLMMessage[] = [
    { content: ACTION_SYSTEM_PROMPT, role: "system" },
    { content: buildUserPrompt(input), role: "user" },
  ];

  try {
    const response = await llmCall(
      env,
      {
        json_schema: ACTION_SCHEMA,
        max_tokens: 200,
        messages,
        task: "image_prompt_assist",
        temperature: 0,
      },
      { user_id: input.userId },
    );
    return parseMomentVisualAction(response.structured ?? response.text);
  } catch {
    return null;
  }
}

export function parseMomentVisualAction(raw: unknown): MomentVisualAction | null {
  let payload: unknown = raw;
  if (typeof raw === "string") {
    try {
      payload = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  const visibleAction = cleanField(record.visible_action, 180);
  if (!visibleAction) return null;

  const action: MomentVisualAction = { visible_action: visibleAction };
  const optionalFields = ["pose", "hands", "gaze", "expression", "props"] as const;
  for (const field of optionalFields) {
    const value = cleanField(record[field], 120);
    if (value) action[field] = value;
  }

  return hasRiskyMultiSubject(action) ? null : action;
}

function cleanField(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max).trim() : text;
}

function hasRiskyMultiSubject(action: MomentVisualAction): boolean {
  return Object.values(action).some((value) => RISKY_MULTI_SUBJECT_PATTERN.test(value));
}
