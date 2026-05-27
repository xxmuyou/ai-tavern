import { requireAdminUser } from "../auth";
import { loadCompanion, serializeJob } from "../companions/emotion-art-routes";
import {
  type ArtJobRow,
  clearNonNeutralEmotions,
  enqueueGenerationJob,
  parseArtEmotions,
} from "../companions/emotion-art";
import { jsonResponse, notFound, readJson } from "../http";
import {
  type CompanionPromptContext,
  NON_NEUTRAL_EMOTIONS,
  buildEmotionPrompt,
} from "../image-gen";

type PrewarmRequest = { force?: boolean };

export async function handleAdminCompanionArtRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const match = pathname.match(
    /^\/admin\/companions\/([^/]+)\/emotion-art\/prewarm$/,
  );
  if (!match) return null;

  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const companionId = decodeURIComponent(match[1] ?? "");
  if (!companionId) {
    return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
  }

  const admin = await requireAdminUser(env, request);
  const body = await safeReadJson(request);
  const force = body?.force === true;

  const companion = await loadCompanion(env, companionId);
  if (!companion) return notFound();

  if (!companion.art_url) {
    return jsonResponse({ error: "neutral_art_required" }, { status: 400 });
  }

  if (force) {
    await clearNonNeutralEmotions(env, companionId);
  }

  // Refresh after potential clear so we know which emotions still need work.
  const refreshed = await loadCompanion(env, companionId);
  if (!refreshed || !refreshed.art_url) {
    return jsonResponse({ error: "neutral_art_required" }, { status: 400 });
  }
  const artMap = parseArtEmotions(refreshed.art_emotions);

  const context: CompanionPromptContext = {
    appearance: refreshed.appearance,
    gender: refreshed.gender,
    name: refreshed.name,
    personality: refreshed.personality,
    relationship_role: refreshed.relationship_role,
  };

  const queued: ArtJobRow[] = [];
  const cached: string[] = [];

  for (const emotion of NON_NEUTRAL_EMOTIONS) {
    if (artMap[emotion]) {
      cached.push(emotion);
      continue;
    }
    const result = await enqueueGenerationJob(env, {
      companionId,
      emotion,
      prompt: buildEmotionPrompt(emotion, context),
      sourceArtUrl: refreshed.art_url,
      userId: admin.id,
    });
    queued.push(result.job);
  }

  return jsonResponse(
    {
      cached_emotions: cached,
      force,
      jobs: queued.map(serializeJob),
    },
    { status: 202 },
  );
}

async function safeReadJson(request: Request): Promise<PrewarmRequest | null> {
  try {
    const text = (await request.clone().text()).trim();
    if (!text) return null;
    return (await readJson<PrewarmRequest>(request)) ?? null;
  } catch {
    return null;
  }
}
