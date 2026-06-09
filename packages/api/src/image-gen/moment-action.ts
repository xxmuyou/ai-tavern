import { llmCall, type LLMMessage } from "../llm";
import type { RelationshipStage } from "../life/types";

export type MomentVisualAction = {
  body_pose: string;
  hand_action?: string;
  gaze?: string;
  expression?: string;
  held_or_nearby_props?: string;
  scene_position?: string;
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
    body_pose: { type: "string" },
    expression: { type: "string" },
    gaze: { type: "string" },
    hand_action: { type: "string" },
    held_or_nearby_props: { type: "string" },
    scene_position: { type: "string" },
  },
  required: ["body_pose"],
  type: "object",
};

const RISKY_MULTI_SUBJECT_PATTERN =
  /\b(user|another person|second person|two people|2 people|couple|crowd|bystander|bystanders|someone|somebody|opponent|people|we|us|our|together|lap|embrace\w*|kiss\w*|touching|held by|holding hands|body contact|reflection|duplicate body)\b/i;

const ACTION_SYSTEM_PROMPT =
  "You are a pose planner for a single-character image edit model. " +
  "Your job is to convert the current chat turn into a drawable solo pose for the companion only. " +
  "Do not summarize the chat. Do not copy narration. Do not preserve physical interactions literally. " +
  "Return one JSON object only with body_pose and optional hand_action, gaze, expression, held_or_nearby_props, scene_position. " +
  "Describe exactly one visible person: the companion. The viewer/user may be implied but must never be visible. " +
  "Never mention: user, another person, second person, couple, crowd, bystanders, together, holding hands with someone, sitting on someone, being held, touching another body, lap, embrace, kiss, reflection of another person, duplicate body. " +
  "Convert interactions into solo reactions: receiving flowers becomes the companion holding flowers alone; receiving coffee becomes a cup near the companion's hands; invitations become the companion turning toward the viewer near the doorway; intimate closeness becomes the companion leaning slightly toward the viewer, alone; leaving someone's lap or bed contact becomes the companion seated alone near the bed edge or adjusting fabric alone. " +
  "Keep every field short, concrete, visual, and image-friendly. Use English image-description wording. Do not include text, dialogue, UI, camera, phone, or photographic device.";

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
    "Plan a safe solo pose for the companion. Return JSON only.",
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
  const bodyPose = cleanField(record.body_pose, 180);
  if (!bodyPose) return null;

  const action: MomentVisualAction = { body_pose: bodyPose };
  const optionalFields = [
    "hand_action",
    "gaze",
    "expression",
    "held_or_nearby_props",
    "scene_position",
  ] as const;
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
