import { requireAuthUser } from "../auth";
import { jsonResponse, notFound } from "../http";
import type { UserRecord } from "../identity";
import { ZERO_DIMENSIONS } from "../relationships/level";
import { loadRelationship } from "../relationships/engine";
import { deriveStage } from "../relationships/stage";
import { computeTimeSlot } from "../life/time-slot";
import {
  completeImageJobWithImage,
  failImageJob,
  loadBaseArtJob,
  maybeDelayRunningHubCapacityError,
  maybeDelayRunningHubImageJob,
  reenqueueImageJob,
  sendImageJob,
  updateImageJob,
  type ImageGenJobRow,
  type ImageGenJobStatus,
} from "./base-art";
import {
  ImageGenError,
  getImageGenProvider,
  type ImageGenRequest,
} from "./index";
import {
  OUTFIT_WORKFLOW_KEY,
  validateCustomOutfitPrompt,
  type OutfitRecommendation,
  type OutfitPromptContext,
  type OutfitPromptSource,
} from "./outfit-image";
import {
  createOrReuseCutoutJob,
  loadCutoutByCompanionAndSource,
  loadCompanionCutoutSource,
} from "./cutout";
import { checkSourceArtAvailable } from "./source-art";
import { normalizeObjectKey } from "./signed-url";

export const TASK_PROFILE_OUTFIT_IMAGE = "profile_outfit_image";

const OUTPUT_PREFIX = "profile-outfits";
const MODE_COLUMN = "image_to_image";
const TERMINAL: ReadonlySet<ImageGenJobStatus> = new Set(["succeeded", "failed", "cancelled"]);

type ProfileRestyleBundle = {
  bodyPose: string;
  cameraView: string;
  background: string;
  expression: string;
  hairstyle: string;
  id: string;
  makeup?: string;
  outfits: {
    female: string;
    male: string;
  };
  summary: string;
  title: string;
};

const PROFILE_STYLE_PRESETS: readonly ProfileRestyleBundle[] = [
  {
    background: "private editorial profile studio, soft clean light, empty background",
    bodyPose: "standing slight side turn, face toward viewer",
    cameraView: "front three-quarter portrait view",
    expression: "calm confident gaze, clear eyes, relaxed brows, natural mouth",
    hairstyle: "soft polished hairstyle",
    id: "profile_signature",
    makeup: "clean natural makeup",
    outfits: {
      female: "fitted ribbed top with a high-waisted tailored mini skirt and sheer stockings",
      male: "fitted knit top with tailored trousers and a lightweight jacket",
    },
    summary: "polished editorial studio style with clean fitted styling",
    title: "Studio Icon",
  },
  {
    background: "quiet private cafe corner, warm window light",
    bodyPose: "expressive seated turn, face toward viewer",
    cameraView: "side-view table-side composition",
    expression: "curious slight smile, bright eyes, gently lifted brows",
    hairstyle: "neat half-up hairstyle",
    id: "profile_cafe_date",
    makeup: "fresh light makeup",
    outfits: {
      female: "fitted knit mini dress with sheer stockings and delicate accessories",
      male: "open-collar knit shirt with slim tailored trousers and a refined casual jacket",
    },
    summary: "warm cafe-date profile style with side-view table-side composition",
    title: "Cafe Date",
  },
  {
    background: "warm private window-side room, clean table-side composition, soft daylight",
    bodyPose: "seated S-curve pose, torso angled, face toward viewer",
    cameraView: "high-angle table-side view",
    expression: "shy warm smile, eyes lowered softly, gentle brows",
    hairstyle: "soft curled half-up hair",
    id: "profile_soft_angle",
    makeup: "fresh polished styling",
    outfits: {
      female: "fitted blouse with a high-waisted short skirt and sheer stockings",
      male: "fitted button-up shirt with rolled sleeves and slim tailored trousers",
    },
    summary: "soft high-angle profile style with a seated S-curve pose",
    title: "Soft Angle",
  },
  {
    background: "private sofa lounge at night, warm lamp light, empty background",
    bodyPose: "reclining side pose, face toward viewer",
    cameraView: "low-angle sofa-side view from below eye level",
    expression: "teasing half-smile, lively eyes, softly lifted brows",
    hairstyle: "loose tousled waves",
    id: "profile_soft_lounge",
    makeup: "soft smoky styling",
    outfits: {
      female: "soft fitted lounge dress with a defined waist",
      male: "soft open lounge shirt with fitted trousers and a relaxed tailored jacket",
    },
    summary: "low-angle private lounge style with warm sofa-side light",
    title: "Lounge Glow",
  },
  {
    background: "soft private hotel room, clean layered bedding and warm bedside light",
    bodyPose: "half-reclining pose, torso slightly raised, face toward viewer",
    cameraView: "high-angle view from above, close intimate crop",
    expression: "soft genuine smile, warm eyes, relaxed brows",
    hairstyle: "softly styled loose hair",
    id: "profile_hotel_soft",
    makeup: "soft warm styling",
    outfits: {
      female: "elegant satin wrap mini dress under a soft open cardigan",
      male: "open-collar soft shirt with tailored lounge trousers and a relaxed robe jacket",
    },
    summary: "soft hotel-room profile style with high-angle close crop",
    title: "Hotel Soft",
  },
  {
    background: "plain private neon studio wall, abstract neon light strips, glossy colored light, empty background",
    bodyPose: "turning under neon light, one shoulder forward, confident stance",
    cameraView: "dynamic angled composition",
    expression: "mischievous bright smile, lively eyes, one brow slightly raised",
    hairstyle: "glossy styled hair",
    id: "profile_bold_restyle",
    makeup: "smoky night styling",
    outfits: {
      female: "off-shoulder bodycon party dress with thigh-high stockings",
      male: "dark fitted sleeveless top with a sleek jacket and tailored trousers",
    },
    summary: "bold neon night style with dynamic angled composition",
    title: "Neon Night",
  },
];

const CUSTOM_PROFILE_STYLE_PRESET: ProfileRestyleBundle = {
  background: "private editorial profile studio, soft clean light, empty background",
  bodyPose: "standing slight side turn, face toward viewer",
  cameraView: "front three-quarter portrait view",
  expression: "calm confident gaze, clear eyes, relaxed brows, natural mouth",
  hairstyle: "soft polished hairstyle",
  id: "profile_custom_safe",
  makeup: "clean natural makeup",
  outfits: {
    female: "clean fitted profile outfit with refined accessories",
    male: "clean fitted profile outfit with tailored layers and refined accessories",
  },
  summary: "custom safe studio style",
  title: "Custom Style",
};

function stylePresetById(id: string): ProfileRestyleBundle | null {
  return PROFILE_STYLE_PRESETS.find((preset) => preset.id === id) ?? null;
}

function outfitForGender(preset: ProfileRestyleBundle, gender: string | null): string {
  return gender?.trim().toLowerCase() === "male" ? preset.outfits.male : preset.outfits.female;
}

export function getProfileRestyleRecommendations(
  ctx: OutfitPromptContext,
  companionId: string,
): OutfitRecommendation[] {
  void ctx;
  void companionId;
  return PROFILE_STYLE_PRESETS.map((preset) => ({
    id: preset.id,
    prompt: preset.summary,
    title: preset.title,
  }));
}

export function findProfileRestyleRecommendation(
  ctx: OutfitPromptContext,
  companionId: string,
  recommendationId: string,
): OutfitRecommendation | null {
  void ctx;
  void companionId;
  const preset = stylePresetById(recommendationId);
  return preset
    ? { id: preset.id, prompt: preset.summary, title: preset.title }
    : null;
}

export function buildProfileRestylePrompt(
  ctx: OutfitPromptContext,
  companionId: string,
  stylePrompt: string,
  preset: ProfileRestyleBundle = CUSTOM_PROFILE_STYLE_PRESET,
): string {
  void companionId;
  const gender = ctx.companion.gender?.trim();
  const outfit = outfitForGender(preset, ctx.companion.gender);
  const lines = [
    "Edit the input image into a single-character profile style image of the same companion.",
    "Keep only this person's facial identity: the same recognizable face and facial features as the input image. The hairstyle, outfit, expression, body pose, camera framing, and private background may all change.",
    "Keep exactly one person in the image - this companion only. Do not add another person, the user, a crowd, reflections of another person, or duplicate bodies.",
    "The companion's face remains visible and recognizable. Do not render any camera, phone, or photographic device.",
    `Style preset: ${preset.title}.`,
    `Change the reference pose to: ${preset.bodyPose}. Do not keep the original portrait pose.`,
    `Camera view: ${preset.cameraView}. Keep the face visible and recognizable.`,
    `Style request (use only for clothing, accessories, colors, and overall styling; ignore any requested pose, camera, background, extra people, or body count): ${stylePrompt.trim()}.`,
    `Outfit (overrides any clothing mentioned in the reference): ${preset.id === CUSTOM_PROFILE_STYLE_PRESET.id ? stylePrompt.trim() : outfit}.`,
  ];

  if (preset.hairstyle.trim()) {
    lines.push(`Change the hairstyle to: ${preset.hairstyle.trim()}.`);
  }
  if (preset.makeup?.trim()) {
    lines.push(`Makeup/Grooming: ${preset.makeup.trim()}.`);
  }
  lines.push(`Expression: ${preset.expression}.`);
  if (gender) {
    lines.push(`Companion gender: ${gender}.`);
  }
  lines.push(
    `Change the background to: ${preset.background}. The background is empty of other people.`,
    "Single companion only, viewer/user not visible, natural profile composition, no other people, no crowd, no second person, no extra characters, no duplicate body, no background figures, no mannequins, no posters of people, no person reflections, no text, no UI, no speech bubbles, no visible camera or photographic device.",
    "No nudity, no lingerie, no fetish outfit.",
  );

  return lines.join("\n");
}

type CompanionProfileOutfitRow = {
  id: string;
  user_id: string;
  companion_id: string;
  prompt_source: OutfitPromptSource | string;
  outfit_prompt: string;
  prompt_snapshot: string;
  job_id: string;
  output_key: string | null;
  status: ImageGenJobStatus | string;
  created_at: number;
  updated_at: number;
};

type CompanionForProfileOutfit = {
  id: string;
  source: "official" | "user";
  created_by: string | null;
  is_active: number;
  is_public: number;
  name: string;
  gender: string | null;
  appearance: string | null;
  personality: string | null;
  relationship_role: string | null;
  art_url: string | null;
};

type GenerateBody =
  | { source?: "recommended"; recommendation_id?: unknown }
  | { source?: "custom"; prompt?: unknown };

export async function handleProfileOutfitRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const recommendationsMatch = pathname.match(/^\/companions\/([^/]+)\/profile-outfit\/recommendations$/);
  if (recommendationsMatch) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const companionId = decodeURIComponent(recommendationsMatch[1] ?? "");
    if (!companionId) return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
    const user = await requireAuthUser(env, request);
    const loaded = await loadVisibleCompanion(env, user, companionId);
    if (!loaded.ok) return loaded.response;
    const ctx = await composeProfileOutfitContext(env, user, loaded.companion);
    return jsonResponse({ recommendations: getProfileRestyleRecommendations(ctx, companionId) });
  }

  const latestMatch = pathname.match(/^\/companions\/([^/]+)\/profile-outfit\/latest$/);
  if (latestMatch) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const companionId = decodeURIComponent(latestMatch[1] ?? "");
    if (!companionId) return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
    const user = await requireAuthUser(env, request);
    return getLatestProfileOutfit(env, user, companionId);
  }

  const generateMatch = pathname.match(/^\/companions\/([^/]+)\/profile-outfit\/generate$/);
  if (generateMatch) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const companionId = decodeURIComponent(generateMatch[1] ?? "");
    if (!companionId) return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
    const user = await requireAuthUser(env, request);
    return generateProfileOutfit(request, env, user, companionId);
  }

  const jobMatch = pathname.match(/^\/profile-outfit-images\/jobs\/([^/]+)$/);
  if (jobMatch) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const jobId = decodeURIComponent(jobMatch[1] ?? "");
    if (!jobId) return jsonResponse({ error: "invalid_job_id" }, { status: 400 });
    const user = await requireAuthUser(env, request);
    return getProfileOutfitJob(env, user, jobId);
  }

  return null;
}

export async function loadEffectiveCompanionArtUrl(
  env: Env,
  userId: string | null,
  companionId: string,
): Promise<{ art_url: string | null; canonical_art_url: string | null; profile_image_override: string | null }> {
  const row = await env.DB.prepare(
    `SELECT c.art_url AS canonical_art_url, p.art_key AS profile_image_override
     FROM companions c
     LEFT JOIN companion_profile_images p
       ON p.companion_id = c.id AND p.user_id = ?
     WHERE c.id = ?`,
  )
    .bind(userId ?? "", companionId)
    .first<{ canonical_art_url: string | null; profile_image_override: string | null }>();
  const canonical = row?.canonical_art_url ?? null;
  const override = row?.profile_image_override ?? null;
  return {
    art_url: override ?? canonical,
    canonical_art_url: canonical,
    profile_image_override: override,
  };
}

export async function setCompanionProfileImage(
  env: Env,
  user: UserRecord,
  companionId: string,
  raw: unknown,
): Promise<Response> {
  const loaded = await loadVisibleCompanion(env, user, companionId);
  if (!loaded.ok) return loaded.response;
  const body = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
  const generationId = typeof body?.generation_id === "string" ? body.generation_id.trim() : "";
  const artKey = typeof body?.art_key === "string" ? body.art_key.trim() : "";
  if (generationId && artKey) {
    return jsonResponse({ error: "profile_image_source_ambiguous" }, { status: 400 });
  }
  if (artKey) {
    return setCompanionProfileImageFromUploadedArt(env, user, companionId, artKey);
  }
  if (!generationId) return jsonResponse({ error: "profile_image_source_required" }, { status: 400 });

  const generation = await env.DB.prepare(
    `SELECT * FROM profile_outfit_images
     WHERE id = ? AND user_id = ? AND companion_id = ?`,
  )
    .bind(generationId, user.id, companionId)
    .first<CompanionProfileOutfitRow>();
  if (!generation) return notFound();

  const job = await loadBaseArtJob(env, generation.job_id);
  const synced = job ? await syncProfileOutfitFromJob(env, generation, job) : generation;
  if (synced.status !== "succeeded" || !synced.output_key) {
    return jsonResponse({ error: "generation_not_ready" }, { status: 422 });
  }

  await upsertUserImageAsset(env, user.id, synced.output_key, "generated", synced.prompt_snapshot);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO companion_profile_images
       (user_id, companion_id, art_key, source_generation_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, companion_id) DO UPDATE SET
       art_key = excluded.art_key,
       source_generation_id = excluded.source_generation_id,
       updated_at = excluded.updated_at`,
  )
    .bind(user.id, companionId, synced.output_key, synced.id, now, now)
    .run();

  return jsonResponse({
    art_url: synced.output_key,
    companion_id: companionId,
    generation_id: synced.id,
    profile_image_override: synced.output_key,
  });
}

async function setCompanionProfileImageFromUploadedArt(
  env: Env,
  user: UserRecord,
  companionId: string,
  rawArtKey: string,
): Promise<Response> {
  const artKey = normalizeObjectKey(rawArtKey);
  if (!artKey) return jsonResponse({ error: "invalid_art_key" }, { status: 400 });
  if (!isUserOwnedArtKey(artKey, user.id)) {
    return jsonResponse({ error: "forbidden_art_key" }, { status: 403 });
  }

  const asset = await env.DB.prepare(
    "SELECT key FROM asset_objects WHERE key = ?",
  )
    .bind(artKey)
    .first<{ key: string }>();
  if (!asset) return jsonResponse({ error: "asset_not_found" }, { status: 404 });

  await upsertUserImageAsset(env, user.id, artKey, "upload", null);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO companion_profile_images
       (user_id, companion_id, art_key, source_generation_id, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?)
     ON CONFLICT(user_id, companion_id) DO UPDATE SET
       art_key = excluded.art_key,
       source_generation_id = NULL,
       updated_at = excluded.updated_at`,
  )
    .bind(user.id, companionId, artKey, now, now)
    .run();

  return jsonResponse({
    art_url: artKey,
    companion_id: companionId,
    profile_image_override: artKey,
  });
}

export async function clearCompanionProfileImage(
  env: Env,
  user: UserRecord,
  companionId: string,
): Promise<Response> {
  const loaded = await loadVisibleCompanion(env, user, companionId);
  if (!loaded.ok) return loaded.response;
  await env.DB.prepare(
    `DELETE FROM companion_profile_images WHERE user_id = ? AND companion_id = ?`,
  )
    .bind(user.id, companionId)
    .run();
  return jsonResponse({ companion_id: companionId, profile_image_override: null });
}

export async function clearProfileImagesForDeletedAsset(
  env: Env,
  userId: string,
  artKey: string,
): Promise<void> {
  await env.DB.prepare(
    `DELETE FROM companion_profile_images WHERE user_id = ? AND art_key = ?`,
  )
    .bind(userId, artKey)
    .run();
}

export async function processProfileOutfitImageJob(env: Env, jobId: string): Promise<void> {
  const job = await loadBaseArtJob(env, jobId);
  if (!job || TERMINAL.has(job.status)) return;

  const generation = await loadProfileOutfitByJob(env, job.id);
  if (!generation) {
    await failImageJob(env, job, "profile_outfit_link_missing", "Profile outfit link is missing");
    return;
  }

  await updateImageJob(env, job.id, { status: "processing" });
  await updateProfileOutfit(env, generation.id, { status: "processing" });

  try {
    const sourceArtUrl = await resolveProfileOutfitSourceArt(env, job, generation);
    if (sourceArtUrl === "waiting_for_cutout") {
      return;
    }
    const request: ImageGenRequest = {
      mode: "variation",
      prompt: job.prompt,
      source_art_url: sourceArtUrl,
      workflow_key: job.workflow_key ?? OUTFIT_WORKFLOW_KEY,
    };
    const provider = await getImageGenProvider(env, "variation", request.workflow_key);
    const capacityDelay = await maybeDelayRunningHubImageJob(env, job, provider);
    if (capacityDelay !== "continue") {
      if (capacityDelay === "timed_out") {
        const failed = await loadBaseArtJob(env, job.id);
        if (failed) await syncProfileOutfitFromJob(env, generation, failed);
      }
      return;
    }
    const response = await provider.generate(request, env);

    if (response.type === "pending") {
      await updateImageJob(env, job.id, {
        error_code: null,
        error_message: null,
        model: response.model,
        provider: response.provider,
        provider_task_id: response.external_task_id,
        provider_submitted_at: Date.now(),
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
    const completed = await loadBaseArtJob(env, job.id);
    if (completed) await syncProfileOutfitFromJob(env, generation, completed);
  } catch (err) {
    const capacityDelay = await maybeDelayRunningHubCapacityError(env, job, err);
    if (capacityDelay !== "continue") {
      if (capacityDelay === "timed_out") {
        const failed = await loadBaseArtJob(env, job.id);
        if (failed) await syncProfileOutfitFromJob(env, generation, failed);
      }
      return;
    }
    if (err instanceof ImageGenError && !err.retryable) {
      await failImageJob(env, job, err.code, err.message);
      await syncProfileOutfitFromJob(env, generation, { ...job, error_code: err.code, error_message: err.message, status: "failed" });
      return;
    }
    const code = err instanceof ImageGenError ? err.code : "provider_error";
    const message = err instanceof Error ? err.message : String(err);
    await failImageJob(env, job, code, message);
    await syncProfileOutfitFromJob(env, generation, { ...job, error_code: code, error_message: message, status: "failed" });
    throw err;
  }
}

async function generateProfileOutfit(
  request: Request,
  env: Env,
  user: UserRecord,
  companionId: string,
): Promise<Response> {
  const loaded = await loadVisibleCompanion(env, user, companionId);
  if (!loaded.ok) return loaded.response;
  const source = await loadCompanionCutoutSource(env, companionId, user.id);
  if (!source?.art_url) return jsonResponse({ error: "source_image_required" }, { status: 422 });
  const available = await checkSourceArtAvailable(env, source.art_cutout_key ?? source.art_url);
  if (!available.ok) {
    return jsonResponse(
      {
        error: available.error,
        key: available.key ?? undefined,
        message: available.key
          ? `Source art is not available to image generation: ${available.key}`
          : "source_art_url missing or invalid",
      },
      { status: 422 },
    );
  }

  const body = (await request.json().catch(() => null)) as GenerateBody | null;
  const parsed = await parseProfileOutfitPrompt(env, user, loaded.companion, body);
  if (!parsed.ok) return parsed.response;

  const now = Date.now();
  const jobId = crypto.randomUUID();
  const generationId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO image_generation_jobs
       (id, user_id, task, mode, status, workflow_key, prompt, output_prefix, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
  )
    .bind(jobId, user.id, TASK_PROFILE_OUTFIT_IMAGE, MODE_COLUMN, OUTFIT_WORKFLOW_KEY, parsed.promptSnapshot, OUTPUT_PREFIX, now, now)
    .run();

  await env.DB.prepare(
    `INSERT INTO profile_outfit_images
       (id, user_id, companion_id, prompt_source, outfit_prompt, prompt_snapshot,
        job_id, output_key, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'queued', ?, ?)`,
  )
    .bind(generationId, user.id, companionId, parsed.promptSource, parsed.outfitPrompt, parsed.promptSnapshot, jobId, now, now)
    .run();

  await sendImageJob(env, {
    created_at: new Date(now).toISOString(),
    job_id: jobId,
    type: "image.generate",
  });

  return jsonResponse({ generation_id: generationId, job_id: jobId, status: "queued" }, { status: 202 });
}

async function getProfileOutfitJob(env: Env, user: UserRecord, jobId: string): Promise<Response> {
  const generation = await loadProfileOutfitByJob(env, jobId);
  if (!generation || generation.user_id !== user.id) return notFound();
  const job = await loadBaseArtJob(env, jobId);
  const synced = job ? await syncProfileOutfitFromJob(env, generation, job) : generation;
  return jsonResponse({
    generation_id: synced.id,
    job_id: synced.job_id,
    output_key: synced.output_key ?? undefined,
    status: synced.status,
  });
}

async function getLatestProfileOutfit(env: Env, user: UserRecord, companionId: string): Promise<Response> {
  const loaded = await loadVisibleCompanion(env, user, companionId);
  if (!loaded.ok) return loaded.response;

  const generation = await env.DB.prepare(
    `SELECT * FROM profile_outfit_images
     WHERE user_id = ? AND companion_id = ?
       AND status NOT IN ('succeeded', 'failed', 'cancelled')
     ORDER BY created_at DESC
     LIMIT 1`,
  )
    .bind(user.id, companionId)
    .first<CompanionProfileOutfitRow>();
  if (!generation) return jsonResponse({ generation: null });

  const job = await loadBaseArtJob(env, generation.job_id);
  const synced = job ? await syncProfileOutfitFromJob(env, generation, job) : generation;
  const isTerminal = TERMINAL.has(synced.status as ImageGenJobStatus);
  return jsonResponse({
    generation: isTerminal
      ? null
      : {
          generation_id: synced.id,
          job_id: synced.job_id,
          output_key: synced.output_key ?? undefined,
          status: synced.status,
      },
  });
}

export async function reenqueueProfileOutfitJobsForCompanion(
  env: Env,
  companionId: string,
): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT j.id
     FROM image_generation_jobs j
     JOIN profile_outfit_images p ON p.job_id = j.id
     WHERE p.companion_id = ?
       AND j.task = ?
       AND j.status IN ('pending', 'processing')
       AND j.provider_task_id IS NULL
       AND j.output_key IS NULL
     ORDER BY j.created_at ASC
     LIMIT 20`,
  )
    .bind(companionId, TASK_PROFILE_OUTFIT_IMAGE)
    .all<{ id: string }>();

  for (const row of results ?? []) {
    await reenqueueImageJob(env, row.id);
  }
}

async function parseProfileOutfitPrompt(
  env: Env,
  user: UserRecord,
  companion: CompanionForProfileOutfit,
  body: GenerateBody | null,
): Promise<
  | { ok: true; outfitPrompt: string; promptSnapshot: string; promptSource: OutfitPromptSource }
  | { ok: false; response: Response }
> {
  const rawBody = body ?? {};
  const source = rawBody.source;
  const ctx = await composeProfileOutfitContext(env, user, companion);

  if (source === "recommended") {
    const recommendationId =
      typeof rawBody.recommendation_id === "string" ? rawBody.recommendation_id.trim() : "";
    if (!recommendationId) {
      return { ok: false, response: jsonResponse({ error: "recommendation_id_required" }, { status: 400 }) };
    }
    const recommendation = findProfileRestyleRecommendation(ctx, companion.id, recommendationId);
    if (!recommendation) {
      return { ok: false, response: jsonResponse({ error: "invalid_recommendation_id" }, { status: 400 }) };
    }
    const preset = stylePresetById(recommendationId);
    if (!preset) {
      return { ok: false, response: jsonResponse({ error: "invalid_recommendation_id" }, { status: 400 }) };
    }
    return {
      ok: true,
      outfitPrompt: recommendation.prompt,
      promptSnapshot: buildProfileRestylePrompt(ctx, companion.id, recommendation.prompt, preset),
      promptSource: "recommended",
    };
  }

  if (source === "custom") {
    const validated = validateCustomOutfitPrompt(rawBody.prompt);
    if (!validated.ok) {
      return {
        ok: false,
        response: jsonResponse(
          { error: validated.error },
          { status: validated.error === "unsafe_prompt" ? 422 : 400 },
        ),
      };
    }
    return {
      ok: true,
      outfitPrompt: validated.prompt,
      promptSnapshot: buildProfileRestylePrompt(ctx, companion.id, validated.prompt),
      promptSource: "custom",
    };
  }

  return { ok: false, response: jsonResponse({ error: "invalid_source" }, { status: 400 }) };
}

async function composeProfileOutfitContext(
  env: Env,
  user: UserRecord,
  companion: CompanionForProfileOutfit,
): Promise<OutfitPromptContext> {
  const [relationship, timezone] = await Promise.all([
    loadRelationship(env, user.id, companion.id),
    loadUserTimezone(env, user.id),
  ]);
  return {
    activity: null,
    companion: {
      appearance: companion.appearance,
      gender: companion.gender,
      name: companion.name,
      personality: companion.personality,
      relationship_role: companion.relationship_role,
    },
    scene: { mood: "private profile portrait", name: "Profile portrait", tags: ["profile", "portrait"] },
    stage: deriveStage(relationship?.dimensions ?? { ...ZERO_DIMENSIONS }).stage,
    timeSlot: computeProfileTimeSlot(timezone),
  };
}

async function loadVisibleCompanion(
  env: Env,
  user: UserRecord,
  companionId: string,
): Promise<{ ok: true; companion: CompanionForProfileOutfit } | { ok: false; response: Response }> {
  const companion = await env.DB.prepare(
    `SELECT id, source, created_by, is_active, is_public, name, gender, appearance, personality,
            relationship_role, art_url
     FROM companions
     WHERE id = ?`,
  )
    .bind(companionId)
    .first<CompanionForProfileOutfit>();
  if (!companion || companion.is_active === 0) return { ok: false, response: notFound() };
  if (companion.source === "user" && companion.created_by !== user.id && companion.is_public !== 1) {
    return { ok: false, response: notFound() };
  }
  return { companion, ok: true };
}

async function resolveProfileOutfitSourceArt(
  env: Env,
  job: ImageGenJobRow,
  generation: CompanionProfileOutfitRow,
): Promise<string | "waiting_for_cutout"> {
  const source = await loadCompanionCutoutSource(env, generation.companion_id, job.user_id ?? generation.user_id);
  if (!source?.art_url) {
    throw new ImageGenError(
      "source_image_required",
      "Companion art_url is required for profile outfit generation",
      { retryable: false },
    );
  }
  if (source.art_cutout_key) return source.art_cutout_key;

  const existingCutout = await loadCutoutByCompanionAndSource(
    env,
    generation.companion_id,
    source.art_url,
  );
  if (existingCutout?.status === "succeeded" && existingCutout.output_key) {
    return existingCutout.output_key;
  }
  if (existingCutout?.status === "failed" || existingCutout?.status === "cancelled") {
    throw new ImageGenError(
      "cutout_failed",
      existingCutout.error_message ?? "Companion cutout failed before profile outfit generation",
      { retryable: false },
    );
  }

  const cutout = existingCutout ?? (await createOrReuseCutoutJob(env, {
    companionId: generation.companion_id,
    sourceArtUrl: source.art_url,
    userId: job.user_id ?? generation.user_id,
  }));
  if (cutout.status === "succeeded" && cutout.output_key) return cutout.output_key;
  if (cutout.status === "failed" || cutout.status === "cancelled") {
    throw new ImageGenError(
      "cutout_failed",
      cutout.error_message ?? "Companion cutout failed before profile outfit generation",
      { retryable: false },
    );
  }

  await updateImageJob(env, job.id, {
    provider_task_id: null,
    status: "processing",
  });
  return "waiting_for_cutout";
}

async function loadProfileOutfitByJob(env: Env, jobId: string): Promise<CompanionProfileOutfitRow | null> {
  return env.DB.prepare(`SELECT * FROM profile_outfit_images WHERE job_id = ?`)
    .bind(jobId)
    .first<CompanionProfileOutfitRow>();
}

async function syncProfileOutfitFromJob(
  env: Env,
  generation: CompanionProfileOutfitRow,
  job: ImageGenJobRow,
): Promise<CompanionProfileOutfitRow> {
  const jobTerminal = TERMINAL.has(job.status);
  const nextStatus = job.status;
  const nextOutputKey = job.output_key ?? null;
  const drifted = generation.status !== nextStatus || (jobTerminal && generation.output_key !== nextOutputKey);
  if (drifted) {
    await updateProfileOutfit(env, generation.id, {
      output_key: nextOutputKey,
      status: nextStatus,
    });
  }
  const next = { ...generation, output_key: nextOutputKey, status: nextStatus, updated_at: Date.now() };
  if (next.status === "succeeded" && next.output_key) {
    await upsertUserImageAsset(env, next.user_id, next.output_key, "generated", next.prompt_snapshot);
  }
  return next;
}

type ProfileOutfitPatch = Partial<Pick<CompanionProfileOutfitRow, "status" | "output_key">>;

async function updateProfileOutfit(env: Env, id: string, patch: ProfileOutfitPatch): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (!fields.length) return;
  fields.push("updated_at = ?");
  values.push(Date.now(), id);
  await env.DB.prepare(`UPDATE profile_outfit_images SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
}

async function upsertUserImageAsset(
  env: Env,
  userId: string,
  artKey: string,
  source: "generated" | "upload",
  prompt: string | null,
): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO user_image_assets
       (id, user_id, art_key, source, prompt, model_id, created_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, NULL)
     ON CONFLICT(user_id, art_key) DO UPDATE SET
       source = excluded.source,
       prompt = COALESCE(excluded.prompt, user_image_assets.prompt),
       deleted_at = NULL`,
  )
    .bind(crypto.randomUUID(), userId, artKey, source, prompt, now)
    .run();
}

function isUserOwnedArtKey(key: string, userId: string): boolean {
  return key.startsWith(`user-art/${userId}/`) || key.startsWith(`companions/user/${userId}/`);
}

async function loadUserTimezone(env: Env, userId: string): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT timezone FROM users WHERE id = ?`)
    .bind(userId)
    .first<{ timezone: string | null }>();
  return row?.timezone ?? null;
}

function computeProfileTimeSlot(timezone: string | null): string {
  return computeTimeSlot(new Date(), timezone ?? "UTC");
}
