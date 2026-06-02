import { isAdminUser, requireAuthUser } from "../auth";
import { isProUser } from "../billing";
import { jsonResponse, notFound } from "../http";
import type { UserRecord } from "../identity";
import {
  type CompanionPromptContext,
  type NonNeutralEmotion,
  buildEmotionPrompt,
  getExpressionPrompt,
  toExpressionGender,
} from "../image-gen";
import {
  type ArtJobRow,
  enqueueGenerationJob,
  isNonNeutralEmotion,
  listJobsForCompanion,
  parseArtEmotions,
} from "./emotion-art";

type CompanionAuthRow = {
  id: string;
  source: "official" | "user";
  created_by: string | null;
  name: string;
  appearance: string | null;
  personality: string | null;
  relationship_role: string | null;
  gender: string | null;
  art_url: string | null;
  art_emotions: string | null;
};

/**
 * Routes for spec-020 companion emotion art:
 *   POST /companions/{id}/emotion-art/{emotion}/generate
 *   GET  /companions/{id}/emotion-art/jobs
 */
export async function handleCompanionEmotionArtRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const generateMatch = pathname.match(
    /^\/companions\/([^/]+)\/emotion-art\/([^/]+)\/generate$/,
  );
  if (generateMatch) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const companionId = decodeURIComponent(generateMatch[1] ?? "");
    const rawEmotion = decodeURIComponent(generateMatch[2] ?? "");
    if (!companionId) {
      return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
    }
    const user = await requireAuthUser(env, request);
    const force = new URL(request.url).searchParams.get("force") === "1";
    return handleGenerate(env, user, companionId, rawEmotion, force);
  }

  const jobsMatch = pathname.match(/^\/companions\/([^/]+)\/emotion-art\/jobs$/);
  if (jobsMatch) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const companionId = decodeURIComponent(jobsMatch[1] ?? "");
    if (!companionId) {
      return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
    }
    const user = await requireAuthUser(env, request);
    return handleListJobs(env, user, companionId);
  }

  return null;
}

async function handleGenerate(
  env: Env,
  user: UserRecord,
  companionId: string,
  rawEmotion: string,
  force = false,
): Promise<Response> {
  if (!isNonNeutralEmotion(rawEmotion)) {
    return jsonResponse({ error: "invalid_emotion" }, { status: 400 });
  }
  const emotion: NonNeutralEmotion = rawEmotion;

  const companion = await loadCompanion(env, companionId);
  if (!companion) return notFound();

  const isAdmin = await isAdminUser(env, user.email);
  const auth = checkGeneratePermission(companion, user, isAdmin);
  if (auth.error) {
    return jsonResponse({ error: auth.error }, { status: auth.status });
  }

  if (!companion.art_url) {
    return jsonResponse({ error: "neutral_art_required" }, { status: 400 });
  }

  // Regenerate (force) skips the cached short-circuit so an already-unlocked
  // expression can be re-rolled. The enqueue UPSERT resets the existing row to
  // pending and clears its output, and a successful run overwrites the emotion
  // key. All other gates (neutral_art_required, Pro/admin) still apply below.
  const artMap = parseArtEmotions(companion.art_emotions);
  if (!force && artMap[emotion]) {
    return jsonResponse({ key: artMap[emotion], status: "cached" });
  }

  // Expression unlock is subscription-gated: only Pro users (or admins) may
  // generate non-neutral expressions. Free users are prompted to subscribe.
  if (!isAdmin && !(await isProUser(env, user.id))) {
    return jsonResponse({ error: "subscription_required" }, { status: 402 });
  }

  // Admin-configured per gender×emotion prompt override (expression_prompts).
  // Falls back to the built-in EMOTION_INTENT when no row exists.
  const intentOverride = await getExpressionPrompt(
    env,
    toExpressionGender(companion.gender),
    emotion,
  );

  const result = await enqueueGenerationJob(env, {
    companionId,
    emotion,
    prompt: buildEmotionPrompt(emotion, toPromptContext(companion), intentOverride),
    sourceArtUrl: companion.art_url,
    userId: user.id,
  });

  return jsonResponse(
    { job_id: result.job.id, reused: result.reused, status: "queued" },
    { status: 202 },
  );
}

async function handleListJobs(
  env: Env,
  user: UserRecord,
  companionId: string,
): Promise<Response> {
  const companion = await loadCompanion(env, companionId);
  if (!companion) return notFound();

  const isAdmin = await isAdminUser(env, user.email);
  const canView = isAdmin || canOwn(companion, user);
  if (!canView) {
    return jsonResponse({ error: "forbidden" }, { status: 403 });
  }

  const jobs = await listJobsForCompanion(env, companionId);
  return jsonResponse({ jobs: jobs.map(serializeJob) });
}

function checkGeneratePermission(
  companion: CompanionAuthRow,
  user: UserRecord,
  isAdmin: boolean,
): { error: null } | { error: string; status: number } {
  if (companion.source === "official") {
    if (!isAdmin) return { error: "forbidden_official", status: 403 };
    return { error: null };
  }
  // user companion
  if (!isAdmin && companion.created_by !== user.id) {
    return { error: "forbidden_not_owner", status: 403 };
  }
  return { error: null };
}

function canOwn(companion: CompanionAuthRow, user: UserRecord): boolean {
  if (companion.source === "official") return false;
  return companion.created_by === user.id;
}

function toPromptContext(row: CompanionAuthRow): CompanionPromptContext {
  return {
    appearance: row.appearance,
    gender: row.gender,
    name: row.name,
    personality: row.personality,
    relationship_role: row.relationship_role,
  };
}

export function serializeJob(row: ArtJobRow): Record<string, unknown> {
  return {
    completed_at: row.completed_at,
    created_at: row.created_at,
    emotion: row.emotion,
    error_code: row.error_code,
    error_message: row.error_message,
    external_task_id: row.external_task_id,
    id: row.id,
    output_key: row.output_key,
    provider: row.provider,
    source_art_url: row.source_art_url,
    status: row.status,
    updated_at: row.updated_at,
  };
}

export async function loadCompanion(
  env: Env,
  companionId: string,
): Promise<CompanionAuthRow | null> {
  return env.DB.prepare(
    `SELECT id, source, created_by, name, appearance, personality,
            relationship_role, gender, art_url, art_emotions
     FROM companions
     WHERE id = ? AND is_active = 1`,
  )
    .bind(companionId)
    .first<CompanionAuthRow>();
}
