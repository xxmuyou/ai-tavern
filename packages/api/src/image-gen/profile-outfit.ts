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
  buildOutfitPrompt,
  findOutfitRecommendation,
  getOutfitRecommendations,
  validateCustomOutfitPrompt,
  type OutfitPromptContext,
  type OutfitPromptSource,
} from "./outfit-image";
import { checkSourceArtAvailable } from "./source-art";

export const TASK_PROFILE_OUTFIT_IMAGE = "profile_outfit_image";

const OUTPUT_PREFIX = "profile-outfits";
const MODE_COLUMN = "image_to_image";
const TERMINAL: ReadonlySet<ImageGenJobStatus> = new Set(["succeeded", "failed", "cancelled"]);

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
    return jsonResponse({ recommendations: getOutfitRecommendations(ctx) });
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

export async function setCompanionProfileImageFromGeneration(
  env: Env,
  user: UserRecord,
  companionId: string,
  raw: unknown,
): Promise<Response> {
  const loaded = await loadVisibleCompanion(env, user, companionId);
  if (!loaded.ok) return loaded.response;
  const body = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
  const generationId = typeof body?.generation_id === "string" ? body.generation_id.trim() : "";
  if (!generationId) return jsonResponse({ error: "generation_id_required" }, { status: 400 });

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

  await upsertUserImageAsset(env, user.id, synced.output_key, synced.prompt_snapshot);
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
    const sourceArtUrl = await loadProfileOutfitSource(env, generation.user_id, generation.companion_id);
    if (!sourceArtUrl) {
      throw new ImageGenError(
        "source_image_required",
        "Companion art_url is required for profile outfit generation",
        { retryable: false },
      );
    }
    const available = await checkSourceArtAvailable(env, sourceArtUrl);
    if (!available.ok) {
      throw new ImageGenError(
        available.error,
        available.key
          ? `Source art is not available to image generation: ${available.key}`
          : "source_art_url missing or invalid",
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
    const completed = await loadBaseArtJob(env, job.id);
    if (completed) await syncProfileOutfitFromJob(env, generation, completed);
  } catch (err) {
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
  const sourceArtUrl = await loadProfileOutfitSource(env, user.id, companionId);
  if (!sourceArtUrl) return jsonResponse({ error: "source_image_required" }, { status: 422 });
  const available = await checkSourceArtAvailable(env, sourceArtUrl);
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

  await env.JOB_QUEUE.send({
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
    const recommendation = findOutfitRecommendation(ctx, recommendationId);
    if (!recommendation) {
      return { ok: false, response: jsonResponse({ error: "invalid_recommendation_id" }, { status: 400 }) };
    }
    return {
      ok: true,
      outfitPrompt: recommendation.prompt,
      promptSnapshot: buildOutfitPrompt(ctx, recommendation.prompt),
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
      promptSnapshot: buildOutfitPrompt(ctx, validated.prompt),
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

async function loadProfileOutfitSource(
  env: Env,
  userId: string,
  companionId: string,
): Promise<string | null> {
  const effective = await loadEffectiveCompanionArtUrl(env, userId, companionId);
  return effective.art_url;
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
    await upsertUserImageAsset(env, next.user_id, next.output_key, next.prompt_snapshot);
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
  prompt: string | null,
): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO user_image_assets
       (id, user_id, art_key, source, prompt, model_id, created_at, deleted_at)
     VALUES (?, ?, ?, 'generated', ?, NULL, ?, NULL)
     ON CONFLICT(user_id, art_key) DO UPDATE SET
       source = 'generated',
       prompt = COALESCE(excluded.prompt, user_image_assets.prompt),
       deleted_at = NULL`,
  )
    .bind(crypto.randomUUID(), userId, artKey, prompt, now)
    .run();
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
