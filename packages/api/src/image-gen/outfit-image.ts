import type { RelationshipStage } from "../life/types";
import {
  ImageGenError,
  getImageGenProvider,
  type ImageGenRequest,
} from "./index";
import {
  completeImageJobWithImage,
  failImageJob,
  loadBaseArtJob,
  updateImageJob,
  type ImageGenJobRow,
  type ImageGenJobStatus,
} from "./base-art";
import { PROFILE_OUTFIT_WORKFLOW_KEY } from "./workflow-keys";

export const TASK_OUTFIT_IMAGE = "chat_outfit_image";
export const OUTFIT_WORKFLOW_KEY = PROFILE_OUTFIT_WORKFLOW_KEY;

const OUTPUT_PREFIX = "chat-outfits";
const MODE_COLUMN = "image_to_image";
const MAX_CUSTOM_PROMPT_LENGTH = 240;

const TERMINAL: ReadonlySet<ImageGenJobStatus> = new Set(["succeeded", "failed", "cancelled"]);

export type OutfitPromptSource = "recommended" | "custom";

export type OutfitRecommendation = {
  id: string;
  title: string;
  prompt: string;
};

export type OutfitPromptContext = {
  companion: {
    name: string;
    gender: string | null;
    appearance: string | null;
    personality: string | null;
    relationship_role: string | null;
  };
  scene: { name: string; mood: string; tags: string[] };
  timeSlot: string;
  stage: RelationshipStage;
  activity: { activity_type: string; activity_hint: string; mood: string } | null;
};

export type ChatOutfitImageRow = {
  id: string;
  user_id: string;
  companion_id: string;
  thread_id: string;
  message_id: string;
  prompt_source: OutfitPromptSource | string;
  outfit_prompt: string;
  prompt_snapshot: string;
  job_id: string;
  output_key: string | null;
  status: string;
  created_at: number;
  updated_at: number;
};

export type CreateOutfitImageInput = {
  userId: string;
  companionId: string;
  threadId: string;
  messageId: string;
  promptSource: OutfitPromptSource;
  outfitPrompt: string;
  promptSnapshot: string;
  /** Credit reservation id to settle when the job reaches a terminal state (spec-021 §F). */
  billingRef?: string | null;
};

const GENERAL_RECOMMENDATIONS: readonly OutfitRecommendation[] = [
  {
    id: "soft_everyday_layers",
    prompt: "soft everyday layered outfit, clean knit top, relaxed jacket, tasteful small accessories",
    title: "Everyday layers",
  },
  {
    id: "polished_smart_casual",
    prompt: "polished smart casual outfit, fitted coat, crisp shirt, elegant understated accessories",
    title: "Smart casual",
  },
  {
    id: "cozy_private_chat",
    prompt: "cozy private-chat outfit, oversized cardigan, soft neutral fabric, comfortable refined styling",
    title: "Cozy private",
  },
];

const SCENE_RECOMMENDATIONS: ReadonlyArray<{
  match: readonly string[];
  items: readonly OutfitRecommendation[];
}> = [
  {
    match: ["cafe", "coffee"],
    items: [
      {
        id: "warm_cafe_layers",
        prompt: "warm cafe outfit, cream knit sweater, cropped jacket, soft scarf, relaxed and intimate styling",
        title: "Cafe layers",
      },
      {
        id: "quiet_bookish_cafe",
        prompt: "quiet bookish cafe outfit, buttoned cardigan, pleated skirt or tailored trousers, subtle vintage details",
        title: "Bookish cafe",
      },
    ],
  },
  {
    match: ["office", "workplace", "work"],
    items: [
      {
        id: "after_hours_office",
        prompt: "after-hours office outfit, tailored blazer, silk blouse, sleek trousers, professional but softened",
        title: "After hours",
      },
      {
        id: "sharp_workday",
        prompt: "sharp workday outfit, structured jacket, monochrome layers, polished minimalist accessories",
        title: "Sharp workday",
      },
    ],
  },
  {
    match: ["gym", "fitness"],
    items: [
      {
        id: "sporty_streetwear",
        prompt: "sporty streetwear outfit, fitted track jacket, clean sneakers, athletic layers, energetic but modest",
        title: "Sporty street",
      },
      {
        id: "post_workout_casual",
        prompt: "post-workout casual outfit, zip hoodie, joggers, towel-like soft texture, clean relaxed styling",
        title: "Post-workout",
      },
    ],
  },
  {
    match: ["bar", "night"],
    items: [
      {
        id: "evening_lounge",
        prompt: "evening lounge outfit, dark fitted jacket, satin-like top, tasteful jewelry, refined night-out styling",
        title: "Evening lounge",
      },
      {
        id: "moonlit_date",
        prompt: "moonlit date outfit, elegant long coat, deep color palette, delicate accessories, romantic but modest",
        title: "Moonlit date",
      },
    ],
  },
  {
    match: ["park", "garden"],
    items: [
      {
        id: "sunny_park_casual",
        prompt: "sunny park outfit, light denim jacket, breathable top, casual trousers, fresh outdoor styling",
        title: "Park casual",
      },
      {
        id: "picnic_soft",
        prompt: "soft picnic outfit, pastel cardigan, airy skirt or relaxed pants, gentle daytime accessories",
        title: "Picnic soft",
      },
    ],
  },
  {
    match: ["library", "bookshop", "book"],
    items: [
      {
        id: "library_academic",
        prompt: "library academic outfit, tweed blazer, soft turtleneck, neat trousers, refined scholarly details",
        title: "Academic",
      },
      {
        id: "quiet_reader",
        prompt: "quiet reader outfit, long cardigan, collared shirt, muted palette, calm thoughtful styling",
        title: "Quiet reader",
      },
    ],
  },
  {
    match: ["market", "harbor", "pier"],
    items: [
      {
        id: "harbor_breeze",
        prompt: "harbor breeze outfit, light windbreaker, striped knit, casual trousers, fresh seaside styling",
        title: "Harbor breeze",
      },
      {
        id: "market_stroll",
        prompt: "market stroll outfit, canvas jacket, comfortable layered top, crossbody bag, lively casual styling",
        title: "Market stroll",
      },
    ],
  },
  {
    match: ["rooftop", "skyline"],
    items: [
      {
        id: "rooftop_evening",
        prompt: "rooftop evening outfit, long tailored coat, sleek boots, wind-swept refined styling",
        title: "Rooftop evening",
      },
      {
        id: "city_lights",
        prompt: "city lights outfit, modern black jacket, metallic accent accessories, elegant urban styling",
        title: "City lights",
      },
    ],
  },
];

const UNSAFE_PROMPT_PATTERNS: readonly RegExp[] = [
  /\bnude\b/i,
  /\bnaked\b/i,
  /\bnsfw\b/i,
  /\bporn\b/i,
  /\berotic\b/i,
  /\bchild\b/i,
  /\bminor\b/i,
  /\bschoolgirl\b/i,
];

function uniqueRecommendations(items: OutfitRecommendation[]): OutfitRecommendation[] {
  const seen = new Set<string>();
  const out: OutfitRecommendation[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function getOutfitRecommendations(ctx: OutfitPromptContext): OutfitRecommendation[] {
  const haystack = [
    ctx.scene.name,
    ctx.scene.mood,
    ctx.timeSlot,
    ...ctx.scene.tags,
    ctx.activity?.activity_type ?? "",
    ctx.activity?.activity_hint ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const selected: OutfitRecommendation[] = [];
  for (const group of SCENE_RECOMMENDATIONS) {
    if (group.match.some((word) => haystack.includes(word))) {
      selected.push(...group.items);
    }
  }

  if (ctx.timeSlot === "evening" || ctx.timeSlot === "night") {
    selected.push({
      id: "soft_evening_layers",
      prompt: "soft evening outfit, long coat, warm layered top, muted deep colors, gentle night styling",
      title: "Soft evening",
    });
  } else {
    selected.push({
      id: "fresh_daytime",
      prompt: "fresh daytime outfit, light jacket, clean top, comfortable tailored bottoms, bright natural styling",
      title: "Fresh daytime",
    });
  }

  if (ctx.stage === "first_contact" || ctx.stage === "familiar") {
    selected.push({
      id: "modest_first_meet",
      prompt: "modest approachable outfit, neat layers, soft colors, friendly everyday styling",
      title: "Approachable",
    });
  } else {
    selected.push({
      id: "refined_close_bond",
      prompt: "refined close-bond outfit, elegant layers, subtle personal accessories, warm polished styling",
      title: "Refined",
    });
  }

  return uniqueRecommendations([...selected, ...GENERAL_RECOMMENDATIONS]).slice(0, 3);
}

export function validateCustomOutfitPrompt(raw: unknown):
  | { ok: true; prompt: string }
  | { ok: false; error: "prompt_required" | "prompt_too_long" | "unsafe_prompt" } {
  const prompt = typeof raw === "string" ? raw.trim() : "";
  if (!prompt) return { error: "prompt_required", ok: false };
  if (prompt.length > MAX_CUSTOM_PROMPT_LENGTH) {
    return { error: "prompt_too_long", ok: false };
  }
  if (UNSAFE_PROMPT_PATTERNS.some((pattern) => pattern.test(prompt))) {
    return { error: "unsafe_prompt", ok: false };
  }
  return { ok: true, prompt };
}

export function buildOutfitPrompt(ctx: OutfitPromptContext, outfitPrompt: string): string {
  const lines: string[] = [
    "Create a single-character outfit variation using the provided companion image as the visual reference.",
    "Keep the same identity, face structure, hairstyle, body type, age impression, art style, framing, and crop.",
    "Only change the clothing, accessories, and small styling details requested below.",
    `Outfit request: ${outfitPrompt.trim()}.`,
  ];

  const companionBits = [
    ctx.companion.appearance?.trim(),
    ctx.companion.personality?.trim(),
  ].filter(Boolean);
  const genderHint = ctx.companion.gender ? ` (${ctx.companion.gender})` : "";
  lines.push(
    `Companion: ${ctx.companion.name}${genderHint}${companionBits.length ? `, ${companionBits.join(", ")}` : ""}.`,
  );
  if (ctx.companion.relationship_role?.trim()) {
    lines.push(`Relationship context: ${ctx.companion.relationship_role.trim()}.`);
  }

  const sceneTags = ctx.scene.tags.length ? `, ${ctx.scene.tags.join(", ")}` : "";
  lines.push(
    `Scene context: ${ctx.scene.name}, ${ctx.timeSlot}, ${ctx.scene.mood}${sceneTags}. Use this only to choose outfit mood, not to add extra people.`,
  );
  if (ctx.activity) {
    const activityBits = [ctx.activity.activity_type, ctx.activity.activity_hint, ctx.activity.mood]
      .map((b) => b.trim())
      .filter(Boolean);
    if (activityBits.length) {
      lines.push(`Activity context: ${activityBits.join(", ")}.`);
    }
  }

  lines.push(
    `Relationship stage: ${ctx.stage}; keep the outfit appropriate for this level of closeness.`,
    "The character has exactly one head, two arms, two hands, and one body. No duplicate body parts.",
    "Single companion only. No text, no UI, no speech bubbles, no logos, no extra characters, no nudity, no lingerie, no fetish outfit.",
  );

  return lines.join("\n");
}

export function findOutfitRecommendation(
  ctx: OutfitPromptContext,
  recommendationId: string,
): OutfitRecommendation | null {
  return getOutfitRecommendations(ctx).find((item) => item.id === recommendationId) ?? null;
}

export async function loadOutfitByMessage(
  env: Env,
  userId: string,
  messageId: string,
): Promise<ChatOutfitImageRow | null> {
  return env.DB.prepare(
    `SELECT * FROM chat_outfit_images WHERE user_id = ? AND message_id = ?`,
  )
    .bind(userId, messageId)
    .first<ChatOutfitImageRow>();
}

export async function loadOutfitByJob(
  env: Env,
  jobId: string,
): Promise<ChatOutfitImageRow | null> {
  return env.DB.prepare(`SELECT * FROM chat_outfit_images WHERE job_id = ?`)
    .bind(jobId)
    .first<ChatOutfitImageRow>();
}

export async function loadCompanionOutfitSource(
  env: Env,
  companionId: string,
  userId: string | null = null,
): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(p.art_key, c.art_url) AS art_url
     FROM companions c
     LEFT JOIN companion_profile_images p
       ON p.companion_id = c.id AND p.user_id = ?
     WHERE c.id = ?`,
  )
    .bind(userId ?? "", companionId)
    .first<{ art_url: string | null }>();
  return row?.art_url ?? null;
}

async function insertImageJob(
  env: Env,
  jobId: string,
  userId: string,
  prompt: string,
  now: number,
  billingRef: string | null,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO image_generation_jobs
       (id, user_id, task, mode, status, workflow_key, prompt, output_prefix, billing_ref, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
  )
    .bind(jobId, userId, TASK_OUTFIT_IMAGE, MODE_COLUMN, OUTFIT_WORKFLOW_KEY, prompt, OUTPUT_PREFIX, billingRef, now, now)
    .run();
}

async function enqueue(env: Env, jobId: string, now: number): Promise<void> {
  await env.JOB_QUEUE.send({
    created_at: new Date(now).toISOString(),
    job_id: jobId,
    type: "image.generate",
  });
}

export async function createOutfitImageJob(
  env: Env,
  input: CreateOutfitImageInput,
): Promise<{ jobId: string; outfitId: string }> {
  const now = Date.now();
  const jobId = crypto.randomUUID();
  const outfitId = crypto.randomUUID();

  await insertImageJob(env, jobId, input.userId, input.promptSnapshot, now, input.billingRef ?? null);

  try {
    await env.DB.prepare(
      `INSERT INTO chat_outfit_images
         (id, user_id, companion_id, thread_id, message_id, prompt_source,
          outfit_prompt, prompt_snapshot, job_id, output_key, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'queued', ?, ?)`,
    )
      .bind(
        outfitId,
        input.userId,
        input.companionId,
        input.threadId,
        input.messageId,
        input.promptSource,
        input.outfitPrompt,
        input.promptSnapshot,
        jobId,
        now,
        now,
      )
      .run();

    await enqueue(env, jobId, now);
  } catch (err) {
    await updateImageJob(env, jobId, {
      completed_at: Date.now(),
      error_code: "outfit_enqueue_failed",
      error_message: err instanceof Error ? err.message : String(err),
      status: "failed",
    });
    throw err;
  }

  return { jobId, outfitId };
}

export async function regenerateOutfitImageJob(
  env: Env,
  outfit: ChatOutfitImageRow,
  input: {
    outfitPrompt: string;
    promptSnapshot: string;
    promptSource: OutfitPromptSource;
    billingRef?: string | null;
  },
): Promise<{ jobId: string; outfitId: string }> {
  const now = Date.now();
  const jobId = crypto.randomUUID();

  await insertImageJob(env, jobId, outfit.user_id, input.promptSnapshot, now, input.billingRef ?? null);
  await env.DB.prepare(
    `UPDATE chat_outfit_images
        SET job_id = ?, prompt_source = ?, outfit_prompt = ?, prompt_snapshot = ?,
            output_key = NULL, status = 'queued', updated_at = ?
      WHERE id = ?`,
  )
    .bind(jobId, input.promptSource, input.outfitPrompt, input.promptSnapshot, now, outfit.id)
    .run();

  await enqueue(env, jobId, now);
  return { jobId, outfitId: outfit.id };
}

export async function processOutfitImageJob(env: Env, jobId: string): Promise<void> {
  const job = await loadBaseArtJob(env, jobId);
  if (!job) return;
  if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
    return;
  }

  await updateImageJob(env, job.id, { status: "processing" });

  try {
    const outfit = await loadOutfitByJob(env, job.id);
    const sourceArtUrl = outfit ? await loadCompanionOutfitSource(env, outfit.companion_id, outfit.user_id) : null;
    if (!sourceArtUrl) {
      throw new ImageGenError(
        "source_image_required",
        "Companion art_url is required for outfit image generation",
        { retryable: false },
      );
    }

    const request: ImageGenRequest = {
      mode: "variation",
      prompt: job.prompt,
      source_art_url: sourceArtUrl,
      workflow_key: job.workflow_key ?? OUTFIT_WORKFLOW_KEY,
    };
    const provider = await getImageGenProvider(env, "variation", request.workflow_key);
    const response = await provider.generate(request, env);

    if (response.type === "pending") {
      await updateImageJob(env, job.id, {
        model: response.model,
        provider: response.provider,
        provider_task_id: response.external_task_id,
        status: "processing",
      });
      return;
    }

    await completeImageJobWithImage(env, job, {
      bytes: response.image_bytes,
      contentType: response.content_type,
      model: response.model,
      provider: response.provider,
    });
  } catch (err) {
    if (err instanceof ImageGenError && !err.retryable) {
      await failImageJob(env, job, err.code, err.message);
      return;
    }
    const code = err instanceof ImageGenError ? err.code : "provider_error";
    const message = err instanceof Error ? err.message : String(err);
    await failImageJob(env, job, code, message);
    throw err;
  }
}

export async function reconcileOutfitFromJob(
  env: Env,
  outfit: ChatOutfitImageRow,
  job: ImageGenJobRow,
): Promise<ChatOutfitImageRow> {
  const jobTerminal = TERMINAL.has(job.status);
  const nextStatus = job.status;
  const nextOutputKey = job.output_key ?? null;
  const drifted =
    outfit.status !== nextStatus ||
    (jobTerminal && outfit.output_key !== nextOutputKey);
  if (!drifted) return outfit;

  const now = Date.now();
  await env.DB.prepare(
    `UPDATE chat_outfit_images SET status = ?, output_key = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(nextStatus, nextOutputKey, now, outfit.id)
    .run();
  return { ...outfit, output_key: nextOutputKey, status: nextStatus, updated_at: now };
}
