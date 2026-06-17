import { llmCall, type LLMMessage } from "../llm";
import type { RelationshipStage } from "../life/types";
import {
  formatMomentStyleProfile,
  resolveMomentStyleProfile,
  stageStyleGuidance,
  stageStyleTier,
  suggestMomentCameraOptions,
  suggestMomentExpressionOptions,
  suggestMomentOutfitOptions,
  suggestMomentPoseOptions,
  type MomentCameraCandidate,
  type MomentScenePrivacy,
  type MomentExpressionCandidate,
  type MomentPoseCandidate,
  type MomentStylePreset,
  type MomentVenue,
} from "./moment-style";

export type MomentVisualAction = {
  body_pose: string;
  camera_view?: string;
  expression?: string;
  outfit?: string;
  hairstyle?: string;
  makeup?: string;
  prop_name?: string;
  prop_state?: MomentPropState;
};

export type MomentPropState = "nearby" | "held_one_hand" | "near_lips" | "just_set_down";

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
    body_pose: { maxLength: 100, type: "string" },
    camera_view: { maxLength: 100, type: "string" },
    expression: { maxLength: 100, type: "string" },
    hairstyle: { maxLength: 100, type: "string" },
    makeup: { maxLength: 100, type: "string" },
    outfit: { maxLength: 120, type: "string" },
    prop_name: { maxLength: 80, type: "string" },
    prop_state: { enum: ["nearby", "held_one_hand", "near_lips", "just_set_down"], type: "string" },
  },
  required: ["body_pose", "camera_view", "outfit", "hairstyle"],
  type: "object",
};

const RISKY_MULTI_SUBJECT_PATTERN =
  /\b(user|another person|second person|two people|2 people|couple|crowd|bystander|bystanders|someone|somebody|opponent|people|we|us|our|together|lap|embrace\w*|kiss\w*|touching|held by|holding hands|body contact|reflection|duplicate body)\b/i;
const POSE_PROP_CONTAMINATION_PATTERN =
  /\b(cups?|glasses?|americano|coffee|latte|tea|menus?|books?|towels?|flowers?|bouquets?)\b/i;
const POSE_HAND_DETAIL_PATTERN =
  /\b(hands?|arms?|fingers?|both hands|two hands|wrapped around|gripp?ing|grips?|grabb?ing|holds?|holding|held|cupping|offering|receiving|handing|passing|taking)\b/i;
const POSE_SCENE_OBJECT_PATTERN =
  /\b(full-body|cafe table|table|counter|chair|bench|bed|doorway|window|railing|shoreline|bar|sofa|stage|fixture|cabinet|equipment|pool|sand|street|aisle|shelf|wall)\b/i;
const EXPRESSION_CONTAMINATION_PATTERN =
  /\b(full-body|standing|seated|sitting|leaning|walking|turning|hands?|arms?|waist|hips?|torso|knees?|cups?|glasses?|flowers?|bouquets?)\b/i;
const OUTFIT_CONTAMINATION_PATTERN =
  /\b(standing|seated|sitting|leaning|walking|turning|hands?|fingers?|holding|held|cups?|glasses?|flowers?|bouquets?|menus?|books?)\b/i;
const PROP_HAND_DETAIL_PATTERN =
  /\b(both hands|two hands|fingers?|wrapped around|gripp?ing|grips?|grabb?ing|holds?|holding|held|cupping|offering|receiving|handing|passing|taking)\b/i;
const CAMERA_VIEW_CONTAMINATION_PATTERN =
  /\b(standing|seated|sitting|walking|reclining|leaning|turning|body pose|cups?|glasses?|americano|coffee|latte|tea|menus?|books?|towels?|flowers?|bouquets?|hands?|arms?|fingers?|holding|held|dress|skirt|shirt|stockings|sweater|jacket|smile|pout|grin|brows?|lips?)\b/i;
const CAMERA_DEVICE_PATTERN =
  /\b(visible camera|camera visible|camera device|phone|smartphone|selfie|viewfinder|dslr|lens|tripod|photographic device|under-table|under table|from under the table)\b/i;

const ACTION_SYSTEM_PROMPT =
  "You are a pose-and-styling planner for a single-character image edit model. " +
  "Keep the companion's recognizable face from the reference image, but change hairstyle, outfit, expression, and body pose to fit the current scene. " +
  "Convert the current chat turn into one drawable solo pose plus a venue-appropriate restyle for the companion only. " +
  "Do not summarize the chat, copy narration, or preserve physical interactions literally. " +
  "Return one JSON object only with body_pose, camera_view, outfit, hairstyle and optional expression, makeup, prop_name, prop_state. " +
  "Keep output compact: body_pose and camera_view must be 100 characters or less; every other field should be 120 characters or less. " +
  "Always restyle: outfit and hairstyle must be deliberate for this venue and time of day, never a generic default. " +
  "Match the styling boldness level given in the request. Whatever the level: never nude, never topless, no exposed nipples, no transparent fabric over the chest, no underwear-only looks in public venues. " +
  "The background location is fixed; body_pose must fit inside the given scene without naming scene objects. " +
  "Choose ONE primary visual moment from multi-action narration. Prefer the last emotionally meaningful stable moment over the first hand/prop action. Do not try to render the whole sequence. " +
  "For sip/set-down/appraising narration, compress it into a single stable frame such as seated slight forward lean, torso angled toward viewer, with the glass as prop_state just_set_down or nearby. " +
  "Derive body_pose from the companion reply narration first. Use previous user message and activity only as supporting context. Use fallback poses only when the narration contains no drawable body action. " +
  "When the narration contains a subtle action, rewrite it into a clearer, more expressive anime-style solo body pose while preserving the same intent. " +
  "body_pose describes only body structure and direction; never mention full-body, tables, counters, chairs, benches, beds, doorways, windows, railings, shoreline, bars, sofas, stage, cups, flowers, menus, books, towels, hands, arms, fingers, holding, gripping, giving, or receiving. " +
  "Choose one camera_view from the venue-safe candidates. camera_view describes only viewpoint and composition; it must not mention props, hands, outfit, expression, body pose, visible camera devices, phones, selfies, viewfinders, or under-table views. Avoid repeating plain eye-level front view unless it best fits the narration. " +
  "Choose one expression candidate and keep expression facial only; never mention body pose, hands, arms, props, or body attitude inside expression. " +
  "Choose one outfit candidate and keep outfit clothing-only; never mention pose, hands, body action, or props inside outfit. " +
  "Props are optional: include prop_name only when the current turn clearly implies exactly one drawable object; omit props when unclear. Use prop_state nearby, held_one_hand, near_lips, or just_set_down. Prefer nearby or just_set_down for public/table scenes. Use held_one_hand only when the chosen visual moment clearly needs the object in one hand. Use near_lips only for a single sip moment. Never write hand_action, held_or_nearby_props, fingers, both hands, or detailed hand wording. " +
  "Describe exactly one visible person: the companion. The viewer/user may be implied but must never be visible. " +
  "Never mention: user, another person, second person, couple, crowd, bystanders, together, holding hands with someone, sitting on someone, being held, touching another body, lap, embrace, kiss, reflection of another person, duplicate body. " +
  "Convert interactions into solo reactions: flowers may become one bouquet prop, coffee may become one cup or glass prop, invitations become the companion turning toward the viewer alone. " +
  "Keep every field short, concrete, visual, and image-friendly. Use English image-description wording. Do not include text, dialogue, UI, visible camera device, phone, or photographic device.";

// Second-attempt reminder. temperature 0 would deterministically reproduce the
// same rejected output, so the retry both raises temperature and appends this.
const RETRY_NUDGE =
  "Your previous answer was rejected. Strict reminder: describe exactly ONE person — the companion alone; " +
  "never mention the user, anyone else, or body contact. If body_pose included hands, props, cups, glasses, tables, chairs, or scene objects, rewrite it as pure body structure and direction only. " +
  "Keep hand/prop narration in prop_name + prop_state, not body_pose. Always include outfit and hairstyle; return valid JSON only.";

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
  const fallbackPoseOptions = suggestMomentPoseOptions(input.sceneVenue, input.companionGender);
  const cameraOptions = suggestMomentCameraOptions(input.sceneVenue, input.scenePrivacy);
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
    `Fallback pose family (only if narration has no drawable body action): ${formatPoseOptions(fallbackPoseOptions)}`,
    `Camera view candidates: ${formatCameraOptions(cameraOptions)}`,
    `Expression candidates: ${formatExpressionOptions(expressionOptions)}`,
    `Outfit candidates: ${formatOutfitOptions(outfitOptions)}`,
    `Emotion: ${input.emotion ?? "neutral"}`,
    `Activity: ${activity}`,
    `Previous user message: ${input.previousUserText ?? "(none)"}`,
    `Companion reply: ${input.sourceReply}`,
    "",
    "Pick one primary visual moment, preferring the last emotionally meaningful stable action over the first hand/prop action. Extract body_pose from the companion reply narration first, but rewrite hand/prop actions into pure body structure. Use fallback pose family only when narration has no drawable body action. Choose camera_view from the venue-safe candidates; avoid plain eye-level front view unless necessary. Keep body_pose and camera_view <= 100 chars. Props are optional; output prop_name + prop_state only when one object is clearly implied. Return JSON only.",
  ].join("\n");
}

function formatPoseOptions(options: readonly MomentPoseCandidate[]): string {
  return options.map((option, index) => `${index + 1}) ${option.bodyPose}`).join(" | ");
}

function formatCameraOptions(options: readonly MomentCameraCandidate[]): string {
  return options.map((option, index) => `${index + 1}) ${option.cameraView}`).join(" | ");
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
        max_tokens: 300,
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
  const bodyPose = cleanField(record.body_pose, 100);
  if (!bodyPose) return null;

  if (
    POSE_PROP_CONTAMINATION_PATTERN.test(bodyPose)
    || POSE_HAND_DETAIL_PATTERN.test(bodyPose)
    || POSE_SCENE_OBJECT_PATTERN.test(bodyPose)
  ) {
    return null;
  }

  const action: MomentVisualAction = { body_pose: bodyPose };
  const cameraView = cleanField(record.camera_view, 100);
  if (cameraView) {
    if (
      CAMERA_VIEW_CONTAMINATION_PATTERN.test(cameraView)
      || CAMERA_DEVICE_PATTERN.test(cameraView)
    ) {
      return null;
    }
    action.camera_view = cameraView;
  }
  const optionalFields = [
    "expression",
    "outfit",
    "hairstyle",
    "makeup",
  ] as const;
  for (const field of optionalFields) {
    const value = cleanField(record[field], 120);
    if (value) action[field] = value;
  }
  if (action.expression && EXPRESSION_CONTAMINATION_PATTERN.test(action.expression)) {
    return null;
  }
  if (action.outfit && OUTFIT_CONTAMINATION_PATTERN.test(action.outfit)) {
    return null;
  }

  const propName = cleanPropName(record.prop_name);
  if (propName) {
    action.prop_name = propName;
    action.prop_state = cleanPropState(record.prop_state, record.prop_relation) ?? "nearby";
  }

  return hasRiskyMultiSubject(action) ? null : action;
}

function cleanField(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max).trim() : text;
}

function cleanPropName(value: unknown): string | null {
  const text = cleanField(value, 80);
  if (!text) return null;
  const withoutHandDetails = text
    .replace(PROP_HAND_DETAIL_PATTERN, " ")
    .replace(/\b(in|with|by)\s+(one|two|both)?\s*hands?\b/gi, " ")
    .replace(/\b(on the table|nearby|held in one hand|in one hand)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:one|a|an)\s+/i, "")
    .replace(/^[,.;:\-\s]+|[,.;:\-\s]+$/g, "");
  if (!withoutHandDetails || PROP_HAND_DETAIL_PATTERN.test(withoutHandDetails)) {
    return null;
  }
  return withoutHandDetails.length > 80 ? withoutHandDetails.slice(0, 80).trim() : withoutHandDetails;
}

function cleanPropState(value: unknown, legacyRelation?: unknown): MomentPropState | null {
  if (
    value === "nearby"
    || value === "held_one_hand"
    || value === "near_lips"
    || value === "just_set_down"
  ) {
    return value;
  }
  if (legacyRelation === "held_in_one_hand") return "held_one_hand";
  if (legacyRelation === "nearby_on_table") return "nearby";
  return null;
}

function hasRiskyMultiSubject(action: MomentVisualAction): boolean {
  return Object.values(action).some((value) => RISKY_MULTI_SUBJECT_PATTERN.test(value));
}
