import { llmCall, type LLMMessage } from "../llm";
import type { RelationshipStage } from "../life/types";
import {
  formatMomentStyleProfile,
  resolveMomentStyleProfile,
  stageStyleGuidance,
  stageStyleTier,
  suggestMomentExpressionOptions,
  suggestMomentOutfitOptions,
  suggestMomentPoseOptions,
  type MomentScenePrivacy,
  type MomentExpressionCandidate,
  type MomentPoseCandidate,
  type MomentStylePreset,
  type MomentVenue,
} from "./moment-style";

export type MomentVisualAction = {
  body_pose: string;
  hand_action?: string;
  gaze?: string;
  expression?: string;
  outfit?: string;
  hairstyle?: string;
  makeup?: string;
  held_or_nearby_props?: string;
  scene_position?: string;
};

export type ExtractMomentVisualActionInput = {
  userId: string;
  companionId: string;
  companionName: string;
  companionGender: string | null;
  previousUserText: string | null;
  sourceReply: string;
  sceneName: string;
  sceneMood: string;
  sceneTags: string[];
  sceneVenue: MomentVenue;
  scenePrivacy: MomentScenePrivacy;
  activity: { activity_type: string; activity_hint: string; mood: string } | null;
  emotion: string | null;
  stage: RelationshipStage;
};

const ACTION_SCHEMA: Record<string, unknown> = {
  additionalProperties: false,
  properties: {
    body_pose: { maxLength: 120, type: "string" },
    expression: { maxLength: 100, type: "string" },
    gaze: { maxLength: 80, type: "string" },
    hairstyle: { maxLength: 100, type: "string" },
    hand_action: { maxLength: 100, type: "string" },
    held_or_nearby_props: { maxLength: 100, type: "string" },
    makeup: { maxLength: 100, type: "string" },
    outfit: { maxLength: 120, type: "string" },
    scene_position: { maxLength: 100, type: "string" },
  },
  required: ["body_pose", "outfit", "hairstyle"],
  type: "object",
};

const RISKY_MULTI_SUBJECT_PATTERN =
  /\b(user|another person|second person|two people|2 people|couple|crowd|bystander|bystanders|someone|somebody|opponent|people|we|us|our|together|lap|embrace\w*|kiss\w*|touching|held by|holding hands|body contact|reflection|duplicate body)\b/i;

const ACTION_SYSTEM_PROMPT =
  "You are a pose-and-styling planner for a single-character image edit model. " +
  "Keep the companion's recognizable face from the reference image, but change hairstyle, outfit, expression, and body pose to fit the current scene. " +
  "Convert the current chat turn into one drawable solo pose plus a venue-appropriate restyle for the companion only. " +
  "Do not summarize the chat, copy narration, or preserve physical interactions literally. " +
  "Return one JSON object only with body_pose, outfit, hairstyle and optional hand_action, gaze, expression, makeup, held_or_nearby_props, scene_position. " +
  "Keep output compact: body_pose must be 120 characters or less; every other field should be 120 characters or less. Do not add extra clauses after a chosen candidate. " +
  "Always restyle: outfit and hairstyle must be deliberate for this venue and time of day, never a generic default. " +
  "Match the styling boldness level given in the request. Whatever the level: never nude, never topless, no exposed nipples, no transparent fabric over the chest, no underwear-only looks in public venues. " +
  "The background location is fixed; body_pose and scene_position must happen inside the given scene. " +
  "Use the pose candidates as body-structure options. Choose one pose candidate, one expression candidate, and one outfit candidate; light edits are allowed only to fit the current turn without changing the selected aesthetic direction. " +
  "Props are optional: include at most one hand action or held/nearby prop only when the companion reply, previous user message, activity, scene name, or scene tags clearly imply it; omit props when unclear. " +
  "Describe exactly one visible person: the companion. The viewer/user may be implied but must never be visible. " +
  "Never mention: user, another person, second person, couple, crowd, bystanders, together, holding hands with someone, sitting on someone, being held, touching another body, lap, embrace, kiss, reflection of another person, duplicate body. " +
  "Convert interactions into solo reactions: receiving flowers becomes the companion holding flowers alone; receiving coffee includes a cup only if this turn clearly mentions it; invitations become the companion turning toward the viewer near the doorway. " +
  "Keep every field short, concrete, visual, and image-friendly. Use English image-description wording. Do not include text, dialogue, UI, camera, phone, or photographic device.";

// Second-attempt reminder. temperature 0 would deterministically reproduce the
// same rejected output, so the retry both raises temperature and appends this.
const RETRY_NUDGE =
  "Your previous answer was rejected. Strict reminder: describe exactly ONE person — the companion alone; " +
  "never mention the user, anyone else, or body contact; always include outfit and hairstyle; return valid JSON only.";

function buildUserPrompt(input: ExtractMomentVisualActionInput): string {
  const activity = input.activity
    ? `${input.activity.activity_type}, ${input.activity.activity_hint}, ${input.activity.mood}`
    : "none";
  const tier = stageStyleTier(input.stage);
  const styleProfile = resolveMomentStyleProfile(input.companionId, input.companionGender);
  const outfitOptions = suggestMomentOutfitOptions(
    input.sceneVenue,
    tier,
    input.companionGender,
    styleProfile,
  );
  const poseOptions = suggestMomentPoseOptions(input.sceneVenue, input.companionGender);
  const expressionOptions = suggestMomentExpressionOptions(input.emotion, input.companionGender);
  return [
    `Companion: ${input.companionName}`,
    `Companion gender: ${input.companionGender ?? "unspecified"}`,
    formatMomentStyleProfile(styleProfile),
    `Scene (fixed background): ${input.sceneName}, ${input.sceneMood}`,
    `Scene tags: ${input.sceneTags.length ? input.sceneTags.join(", ") : "(none)"}`,
    `Venue type: ${input.sceneVenue}; setting: ${input.scenePrivacy}`,
    `Relationship stage: ${input.stage}`,
    `Styling boldness: ${stageStyleGuidance(tier)}`,
    `Pose candidates: ${formatPoseOptions(poseOptions)}`,
    `Expression candidates: ${formatExpressionOptions(expressionOptions)}`,
    `Outfit candidates: ${formatOutfitOptions(outfitOptions)}`,
    `Emotion: ${input.emotion ?? "neutral"}`,
    `Activity: ${activity}`,
    `Previous user message: ${input.previousUserText ?? "(none)"}`,
    `Companion reply: ${input.sourceReply}`,
    "",
    "Plan a safe solo pose by choosing from the pose, expression, and outfit candidates. Keep body_pose <= 120 chars. Props are optional; include one only when clearly implied. Return JSON only.",
  ].join("\n");
}

function formatPoseOptions(options: readonly MomentPoseCandidate[]): string {
  return options.map((option, index) => `${index + 1}) ${option.bodyPose}`).join(" | ");
}

function formatExpressionOptions(options: readonly MomentExpressionCandidate[]): string {
  return options.map((option, index) => `${index + 1}) ${option.expression}`).join(" | ");
}

function formatOutfitOptions(options: readonly MomentStylePreset[]): string {
  return options
    .map((option, index) => {
      const details = [
        option.outfit,
        `hairstyle: ${option.hairstyle}`,
        option.makeup ? `makeup: ${option.makeup}` : null,
      ].filter(Boolean);
      return `${index + 1}) ${details.join("; ")}`;
    })
    .join(" | ");
}

async function attemptExtract(
  env: Env,
  userId: string,
  messages: LLMMessage[],
  temperature: number,
): Promise<MomentVisualAction | null> {
  try {
    const response = await llmCall(
      env,
      {
        json_schema: ACTION_SCHEMA,
        max_tokens: 260,
        messages,
        task: "image_prompt_assist",
        temperature,
      },
      { user_id: userId },
    );
    return parseMomentVisualAction(response.structured ?? response.text);
  } catch {
    return null;
  }
}

export async function extractMomentVisualAction(
  env: Env,
  input: ExtractMomentVisualActionInput,
): Promise<MomentVisualAction | null> {
  const messages: LLMMessage[] = [
    { content: ACTION_SYSTEM_PROMPT, role: "system" },
    { content: buildUserPrompt(input), role: "user" },
  ];

  const first = await attemptExtract(env, input.userId, messages, 0);
  if (first) return first;

  return attemptExtract(
    env,
    input.userId,
    [...messages, { content: RETRY_NUDGE, role: "user" }],
    0.5,
  );
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
  const bodyPose = cleanField(record.body_pose, 120);
  if (!bodyPose) return null;

  const action: MomentVisualAction = { body_pose: bodyPose };
  const optionalFields = [
    "hand_action",
    "gaze",
    "expression",
    "outfit",
    "hairstyle",
    "makeup",
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
