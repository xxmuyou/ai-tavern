import { isAdminUser, requireAuthUser } from "../auth";
import { isProUser } from "../billing/entitlements";
import { QUOTA_LIMITS } from "../billing/quota";
import { jsonResponse, notFound, readJson } from "../http";
import type { UserRecord } from "../identity";
import { ZERO_DIMENSIONS, computeLevel } from "../relationships";
import {
  defaultVoiceIdForGender,
  defaultVoiceSpeed,
  isValidVoiceId,
  normalizeVoiceSpeed,
  type VoiceSpeedId,
} from "../voice/config";
import { getOrComputeDailyState, getOrGenerateFlavorText } from "../life/daily-state";
import { computeDateLocal, computeTimeSlot } from "../life/time-slot";
import {
  neutralOnlyArtEmotions,
  parseArtEmotions,
} from "./emotion-art";
import {
  companionToCard,
  extractCardData,
  mapCardToCompanionInput,
} from "./card";
import { handleBaseArtRequest } from "./base-art-routes";
import { handleCompanionEmotionArtRequest } from "./emotion-art-routes";
import type { Gender } from "./gender-weight";
import { handleCompanionArtUpload } from "./upload-art";
import { handleCompanionStoryRequest } from "../story-beats";
import { handleInviteTargetsRequest } from "../scenes/invite";
import {
  clearCompanionProfileImage,
  handleProfileOutfitRequest,
  loadEffectiveCompanionArtUrl,
  setCompanionProfileImageFromGeneration,
} from "../image-gen/profile-outfit";
import {
  handleCompanionCutoutRequest,
  loadCompanionCutoutStatus,
} from "./cutout-routes";

const MAX_FREE_USER_COMPANIONS = QUOTA_LIMITS.FREE_CUSTOM_COMPANIONS;
const NAME_MAX = 80;
const TEXT_FIELD_MAX = 4000;
const KNOWN_RELATIONSHIP_ROLES: ReadonlySet<string> = new Set([
  "colleague",
  "neighbor",
  "friend",
  "crush",
  "stranger",
  "family",
]);
const KNOWN_GENDERS: ReadonlySet<Gender> = new Set(["male", "female"]);

type CompanionRow = {
  id: string;
  source: "official" | "user";
  created_by: string | null;
  is_active: number;
  is_public: number;
  name: string;
  appearance: string | null;
  personality: string | null;
  background: string | null;
  speech_style: string | null;
  voice_id: string | null;
  voice_speed: string | null;
  relationship_role: string | null;
  want: string | null;
  secret: string | null;
  boundary: string | null;
  greeting: string | null;
  example_dialogues: string | null;
  tags: string | null;
  play_count: number;
  preferred_scenes: string | null;
  art_url: string | null;
  canonical_art_url?: string | null;
  favorite_count?: number | null;
  profile_image_override?: string | null;
  art_cutout_key: string | null;
  art_emotions: string | null;
  featured_rank?: number | null;
  trend_rank?: number | null;
  gender: string | null;
  initial_dims: string | null;
  created_at: number;
  updated_at: number;
};

type RelationshipRow = {
  closeness: number;
  trust: number;
  romance: number;
  friendship: number;
  hostility: number;
  tension: number;
  distance: number;
  level_label: string | null;
  first_met_at: number;
  last_interaction_at: number;
};

type FavoriteSummaryRow = {
  favorite_count: number;
  is_favorite: number;
};

type CompanionListItem = {
  id: string;
  source: "official" | "user";
  is_public: boolean;
  name: string;
  gender: Gender | null;
  relationship_role: string | null;
  art_url: string | null;
  favorite_count: number;
  preferred_scenes: string[];
  tags: string[];
  play_count: number;
  is_favorite: boolean;
  current_level: string | null;
  last_interaction_at: number | null;
};

export async function handleCompanionsRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname === "/companions/public") {
    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const url = new URL(request.url);
    return listPublicCompanions(env, {
      artStyle: url.searchParams.get("art_style"),
      gender: url.searchParams.get("gender"),
      q: url.searchParams.get("q"),
      featured: url.searchParams.get("featured"),
      sort: url.searchParams.get("sort"),
      source: url.searchParams.get("source"),
    });
  }

  if (pathname === "/companions") {
    const user = await requireAuthUser(env, request);

    if (request.method === "GET") {
      const url = new URL(request.url);
      return listCompanions(env, user, {
        q: url.searchParams.get("q"),
        sort: url.searchParams.get("sort"),
        source: url.searchParams.get("source") ?? "all",
      });
    }

    if (request.method === "POST") {
      const body = await readJson<unknown>(request);
      return createCompanion(env, user, body);
    }

    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  if (pathname === "/companions/upload-art") {
    return handleCompanionArtUpload(request, env);
  }

  if (pathname === "/companions/import") {
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const user = await requireAuthUser(env, request);
    const body = await readJson<unknown>(request);
    return importCard(env, user, body);
  }

  const exportMatch = pathname.match(/^\/companions\/([^/]+)\/export$/);
  if (exportMatch) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const companionId = decodeURIComponent(exportMatch[1] ?? "");
    if (!companionId) {
      return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
    }
    const user = await requireAuthUser(env, request);
    return exportCard(env, user, companionId);
  }

  const baseArtResponse = await handleBaseArtRequest(request, env, pathname);
  if (baseArtResponse) {
    return baseArtResponse;
  }

  const emotionArtResponse = await handleCompanionEmotionArtRequest(request, env, pathname);
  if (emotionArtResponse) {
    return emotionArtResponse;
  }

  const profileOutfitResponse = await handleProfileOutfitRequest(request, env, pathname);
  if (profileOutfitResponse) {
    return profileOutfitResponse;
  }

  const cutoutResponse = await handleCompanionCutoutRequest(request, env, pathname);
  if (cutoutResponse) {
    return cutoutResponse;
  }

  const publishMatch = pathname.match(/^\/companions\/([^/]+)\/publish$/);
  if (publishMatch) {
    if (request.method !== "PUT") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const companionId = decodeURIComponent(publishMatch[1] ?? "");
    if (!companionId) {
      return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
    }
    const user = await requireAuthUser(env, request);
    const body = await readJson<unknown>(request);
    return setCompanionPublic(env, user, companionId, body);
  }

  const favoriteMatch = pathname.match(/^\/companions\/([^/]+)\/favorite$/);
  if (favoriteMatch) {
    const companionId = decodeURIComponent(favoriteMatch[1] ?? "");
    if (!companionId) {
      return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
    }
    if (request.method !== "POST" && request.method !== "DELETE") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const user = await requireAuthUser(env, request);
    return setFavorite(env, user, companionId, request.method === "POST");
  }

  const profileImageMatch = pathname.match(/^\/companions\/([^/]+)\/profile-image$/);
  if (profileImageMatch) {
    const companionId = decodeURIComponent(profileImageMatch[1] ?? "");
    if (!companionId) {
      return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
    }
    if (request.method !== "PUT" && request.method !== "DELETE") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const user = await requireAuthUser(env, request);
    if (request.method === "DELETE") {
      return clearCompanionProfileImage(env, user, companionId);
    }
    const body = await readJson<unknown>(request);
    return setCompanionProfileImageFromGeneration(env, user, companionId, body);
  }

  const dailyStateMatch = pathname.match(/^\/companions\/([^/]+)\/daily-state$/);
  if (dailyStateMatch) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const companionId = decodeURIComponent(dailyStateMatch[1] ?? "");
    if (!companionId) {
      return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
    }
    const user = await requireAuthUser(env, request);
    const url = new URL(request.url);
    const includeFlavor = url.searchParams.get("include_flavor") === "1";
    return getDailyState(env, user, companionId, includeFlavor);
  }

  const storyMatch = pathname.match(/^\/companions\/([^/]+)(\/story-(?:arcs|beats|moment|choices).*)$/);
  if (storyMatch) {
    const companionId = decodeURIComponent(storyMatch[1] ?? "");
    const suffix = storyMatch[2] ?? "";
    if (!companionId) {
      return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
    }
    const user = await requireAuthUser(env, request);
    return handleCompanionStoryRequest(request, env, user, companionId, suffix);
  }

  const inviteTargetsResponse = await handleInviteTargetsRequest(request, env, pathname);
  if (inviteTargetsResponse) {
    return inviteTargetsResponse;
  }

  const momentImagesMatch = pathname.match(/^\/companions\/([^/]+)\/moment-images$/);
  if (momentImagesMatch) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const companionId = decodeURIComponent(momentImagesMatch[1] ?? "");
    if (!companionId) {
      return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
    }
    const user = await requireAuthUser(env, request);
    return listCompanionMomentImages(env, user, companionId);
  }

  const idMatch = pathname.match(/^\/companions\/([^/]+)$/);
  if (idMatch) {
    const companionId = decodeURIComponent(idMatch[1] ?? "");
    if (!companionId) {
      return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
    }

    const user = await requireAuthUser(env, request);

    if (request.method === "GET") {
      return getCompanion(env, user, companionId);
    }

    if (request.method === "PUT") {
      const body = await readJson<unknown>(request);
      return updateCompanion(env, user, companionId, body);
    }

    if (request.method === "DELETE") {
      return deleteCompanion(env, user, companionId);
    }

    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  // /companions/assist or other sub-paths -> let index.ts 404 (spec-002 will wire LLM-assisted creation)
  return null;
}

// -----------------------------------------------------------------------------
// Handlers
// -----------------------------------------------------------------------------

type ListOptions = { source: string; q: string | null; sort: string | null };
type PublicListOptions = {
  artStyle: string | null;
  featured: string | null;
  gender: string | null;
  q: string | null;
  sort: string | null;
  source: string | null;
};

async function listPublicCompanions(env: Env, opts: PublicListOptions): Promise<Response> {
  const conditions: string[] = ["c.is_active = 1", "(c.source = 'official' OR c.is_public = 1)"];
  const whereBinds: unknown[] = [];

  if (opts.source === "official") {
    conditions.push("c.source = 'official'");
  }
  if (opts.featured === "1") {
    conditions.push("c.featured_rank IS NOT NULL");
  }

  const gender = normalizeGender(opts.gender);
  if (gender) {
    conditions.push("c.gender = ?");
    whereBinds.push(gender);
  }

  const query = opts.q?.trim();
  if (query) {
    const like = `%${query}%`;
    conditions.push("(c.name LIKE ? OR c.tags LIKE ?)");
    whereBinds.push(like, like);
  }

  let orderBy: string;
  switch (opts.sort) {
    case "favorites":
      orderBy = "favorite_count DESC, c.play_count DESC, c.created_at ASC";
      break;
    case "featured":
      orderBy = "c.featured_rank IS NULL ASC, c.featured_rank ASC, c.created_at ASC";
      break;
    case "trending":
      orderBy = "c.trend_rank IS NULL ASC, c.trend_rank ASC, c.play_count DESC, c.created_at ASC";
      break;
    case "popular":
      orderBy = "c.play_count DESC, c.created_at ASC";
      break;
    case "recent":
      orderBy = "c.created_at DESC";
      break;
    default:
      orderBy = "c.created_at ASC";
  }

  const { results } = await env.DB.prepare(
    `SELECT c.id, c.source, c.created_by, c.is_active, c.is_public, c.name,
            c.appearance, c.personality, c.background, c.speech_style,
            c.relationship_role, c.tags, c.play_count, c.preferred_scenes,
            c.art_url, c.gender, c.initial_dims, c.created_at, c.updated_at,
            c.featured_rank, c.trend_rank,
            COALESCE(fav.favorite_count, 0) AS favorite_count
     FROM companions c
     LEFT JOIN (
       SELECT companion_id, COUNT(*) AS favorite_count
       FROM companion_favorites
       GROUP BY companion_id
     ) fav ON fav.companion_id = c.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY ${orderBy}`,
  )
    .bind(...whereBinds)
    .all<CompanionRow>();

  const styleBucket = normalizeDiscoveryStyle(opts.artStyle);
  const items: CompanionListItem[] = (results ?? [])
    .map((row) => publicCompanionListItem(row))
    .filter((item) => !styleBucket || companionMatchesDiscoveryStyle(item.tags, styleBucket));

  return jsonResponse({ items });
}

async function listCompanions(env: Env, user: UserRecord, opts: ListOptions): Promise<Response> {
  const conditions: string[] = ["c.is_active = 1"];
  const whereBinds: unknown[] = [];

  switch (opts.source) {
    case "official":
      conditions.push("c.source = 'official'");
      break;
    case "user":
      conditions.push("c.source = 'user'", "c.created_by = ?");
      whereBinds.push(user.id);
      break;
    case "public":
      // The shared public area: every companion an admin has published.
      conditions.push("c.is_public = 1");
      break;
    case "favorites":
      // Companions this user has saved (the favorites join is non-null).
      conditions.push("f.user_id IS NOT NULL");
      break;
    case "all":
    default:
      conditions.push("(c.source = 'official' OR c.created_by = ?)");
      whereBinds.push(user.id);
  }

  const query = opts.q?.trim();
  if (query) {
    const like = `%${query}%`;
    conditions.push("(c.name LIKE ? OR c.tags LIKE ?)");
    whereBinds.push(like, like);
  }

  let orderBy: string;
  switch (opts.sort) {
    case "popular":
      orderBy = "c.play_count DESC, c.created_at ASC";
      break;
    case "recent":
      orderBy = "c.created_at DESC";
      break;
    default:
      orderBy = "c.created_at ASC";
  }

  const { results } = await env.DB.prepare(
    `SELECT c.id, c.source, c.created_by, c.is_active, c.is_public, c.name,
            c.appearance, c.personality, c.background, c.speech_style,
            c.relationship_role, c.tags, c.play_count, c.preferred_scenes,
            COALESCE(p.art_key, c.art_url) AS art_url,
            c.art_url AS canonical_art_url,
            p.art_key AS profile_image_override,
            c.gender, c.initial_dims, c.created_at, c.updated_at,
            r.level_label         AS level_label,
            r.last_interaction_at AS last_interaction_at,
            f.user_id             AS fav_user,
            COALESCE(fav_counts.favorite_count, 0) AS favorite_count
     FROM companions c
     LEFT JOIN relationships r ON r.companion_id = c.id AND r.user_id = ?
     LEFT JOIN companion_favorites f ON f.companion_id = c.id AND f.user_id = ?
     LEFT JOIN companion_profile_images p ON p.companion_id = c.id AND p.user_id = ?
     LEFT JOIN (
       SELECT companion_id, COUNT(*) AS favorite_count
       FROM companion_favorites
       GROUP BY companion_id
     ) fav_counts ON fav_counts.companion_id = c.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY ${orderBy}`,
  )
    .bind(user.id, user.id, user.id, ...whereBinds)
    .all<
      CompanionRow & {
        level_label: string | null;
        last_interaction_at: number | null;
        fav_user: string | null;
      }
    >();

  const items: CompanionListItem[] = (results ?? []).map((row) => ({
    art_url: row.art_url,
    current_level: row.level_label,
    favorite_count: Number(row.favorite_count ?? 0),
    gender: normalizeGender(row.gender),
    id: row.id,
    is_favorite: row.fav_user !== null,
    is_public: row.is_public === 1,
    last_interaction_at: row.last_interaction_at,
    name: row.name,
    play_count: row.play_count,
    preferred_scenes: parseStringArray(row.preferred_scenes),
    relationship_role: row.relationship_role,
    source: row.source,
    tags: parseStringArray(row.tags),
  }));

  return jsonResponse({ items });
}

function publicCompanionListItem(row: CompanionRow): CompanionListItem {
  return {
    art_url: row.art_url,
    current_level: null,
    favorite_count: Number(row.favorite_count ?? 0),
    gender: normalizeGender(row.gender),
    id: row.id,
    is_favorite: false,
    is_public: row.is_public === 1,
    last_interaction_at: null,
    name: row.name,
    play_count: row.play_count,
    preferred_scenes: parseStringArray(row.preferred_scenes),
    relationship_role: row.relationship_role,
    source: row.source,
    tags: parseStringArray(row.tags),
  };
}

async function listCompanionMomentImages(
  env: Env,
  user: UserRecord,
  companionId: string,
): Promise<Response> {
  const companion = await loadCompanion(env, companionId);
  if (!companion || !canRead(companion, user)) {
    return notFound();
  }

  const { results } = await env.DB.prepare(
    `SELECT id, job_id, message_id, status, output_key, created_at, updated_at
     FROM story_moment_images
     WHERE user_id = ?
       AND companion_id = ?
       AND status IN ('processing', 'succeeded')
     ORDER BY created_at DESC
     LIMIT 100`,
  )
    .bind(user.id, companionId)
    .all<{
      id: string;
      job_id: string;
      message_id: string;
      status: string;
      output_key: string | null;
      created_at: number;
      updated_at: number;
    }>();

  return jsonResponse({ moment_images: results ?? [] });
}

async function setFavorite(
  env: Env,
  user: UserRecord,
  companionId: string,
  favorite: boolean,
): Promise<Response> {
  const row = await loadCompanion(env, companionId);
  if (!row || !canRead(row, user)) {
    return notFound();
  }

  if (favorite) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO companion_favorites (user_id, companion_id, created_at)
       VALUES (?, ?, ?)`,
    )
      .bind(user.id, companionId, Date.now())
      .run();
  } else {
    await env.DB.prepare(
      `DELETE FROM companion_favorites WHERE user_id = ? AND companion_id = ?`,
    )
      .bind(user.id, companionId)
      .run();
  }

  return jsonResponse({ id: companionId, is_favorite: favorite });
}

async function getDailyState(
  env: Env,
  user: UserRecord,
  companionId: string,
  includeFlavor: boolean,
): Promise<Response> {
  const companion = await loadCompanion(env, companionId);
  if (!companion) return notFound();
  if (!canRead(companion, user)) return notFound();

  const tz = await loadUserTimezone(env, user.id);
  const now = new Date();
  const dateLocal = computeDateLocal(now, tz);
  const slot = computeTimeSlot(now, tz);

  const state = await getOrComputeDailyState(env, companionId, dateLocal, slot);
  if (!state) return notFound();

  let flavor_text: string | null = null;
  if (includeFlavor) {
    flavor_text = await getOrGenerateFlavorText(env, user.id, state, companion.name);
  }

  return jsonResponse({ ...state, flavor_text });
}

async function loadUserTimezone(env: Env, userId: string): Promise<string> {
  const row = await env.DB.prepare(
    `SELECT timezone FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first<{ timezone: string | null }>();
  return row?.timezone ?? "UTC";
}

/**
 * Publish (or unpublish) a companion into the shared public area. Restricted to
 * admins acting on their own user-created companion: an admin earns the right to
 * surface a companion they built (portraits and all) to every player. Ownership
 * and `source` are untouched — only the `is_public` flag flips.
 */
async function setCompanionPublic(
  env: Env,
  user: UserRecord,
  companionId: string,
  body: unknown,
): Promise<Response> {
  const isAdmin = await isAdminUser(env, user.email);
  if (!isAdmin) {
    return jsonResponse({ error: "forbidden" }, { status: 403 });
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  if (typeof raw.is_public !== "boolean") {
    return jsonResponse({ error: "is_public_required" }, { status: 400 });
  }
  const makePublic = raw.is_public;
  const shareStoryArcs = raw.share_story_arcs === true;

  const row = await loadCompanion(env, companionId);
  if (!row) return notFound();
  if (row.source !== "user") {
    return jsonResponse({ error: "official_not_publishable" }, { status: 400 });
  }
  if (row.created_by !== user.id) {
    return jsonResponse({ error: "forbidden_not_owner" }, { status: 403 });
  }
  if (makePublic && !row.art_url) {
    return jsonResponse({ error: "neutral_art_required" }, { status: 400 });
  }

  await env.DB.prepare(
    `UPDATE companions SET is_public = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(makePublic ? 1 : 0, Date.now(), companionId)
    .run();

  await env.DB.prepare(
    `UPDATE companion_story_arcs
     SET shared_with_public = ?, updated_at = ?
     WHERE companion_id = ? AND owner_user_id = ? AND source_type <> 'official_seed'`,
  )
    .bind(makePublic && shareStoryArcs ? 1 : 0, Date.now(), companionId, user.id)
    .run();

  return jsonResponse({
    id: companionId,
    is_public: makePublic,
    shared_story_arcs: makePublic && shareStoryArcs,
  });
}

async function getCompanion(env: Env, user: UserRecord, companionId: string): Promise<Response> {
  const row = await loadCompanion(env, companionId);
  if (!row) {
    return notFound();
  }

  if (!canRead(row, user)) {
    return notFound();
  }

  const relationship = await loadRelationship(env, user.id, companionId);
  const favoriteSummary = await loadFavoriteSummary(env, user.id, companionId);
  const effectiveArt = await loadEffectiveCompanionArtUrl(env, user.id, companionId);
  const cutoutStatus = await loadCompanionCutoutStatus(env, user.id, companionId);
  const dimensions = relationship
    ? {
        closeness: relationship.closeness,
        distance: relationship.distance,
        friendship: relationship.friendship,
        hostility: relationship.hostility,
        romance: relationship.romance,
        tension: relationship.tension,
        trust: relationship.trust,
      }
    : { ...ZERO_DIMENSIONS };

  const body: Record<string, unknown> = {
    appearance: row.appearance,
    art_emotions: effectiveArt.profile_image_override
      ? neutralOnlyArtEmotions(effectiveArt.art_url ?? "")
      : serializeArtEmotions(row.art_emotions),
    art_cutout_url: cutoutStatus?.status === "succeeded" ? cutoutStatus.art_cutout_url : null,
    art_url: effectiveArt.art_url,
    background: row.background,
    canonical_art_url: effectiveArt.canonical_art_url,
    gender: normalizeGender(row.gender),
    greeting: row.greeting,
    favorite_count: favoriteSummary.favorite_count,
    id: row.id,
    is_favorite: favoriteSummary.is_favorite === 1,
    is_public: row.is_public === 1,
    name: row.name,
    personality: row.personality,
    play_count: row.play_count,
    profile_image_override: effectiveArt.profile_image_override,
    preferred_scenes: parseStringArray(row.preferred_scenes),
    tags: parseStringArray(row.tags),
    relationship: {
      dimensions,
      first_met_at: relationship?.first_met_at ?? null,
      last_interaction_at: relationship?.last_interaction_at ?? null,
      level: computeLevel(dimensions),
    },
    relationship_role: row.relationship_role,
    source: row.source,
    speech_style: row.speech_style,
    voice_id: row.voice_id ?? defaultVoiceIdForGender(env, row.gender),
    voice_speed: normalizeVoiceSpeed(row.voice_speed) ?? defaultVoiceSpeed(env),
  };

  // The persona "driver" fields are spoilers (and `secret` is gated content),
  // so they are only exposed to the owner of a user-created companion — who
  // needs them to pre-fill the edit form. Official-companion secrets reach the
  // player through the unlock endpoint once earned, never through this payload.
  if (row.source === "user" && row.created_by === user.id) {
    body.want = row.want;
    body.secret = row.secret;
    body.boundary = row.boundary;
    body.example_dialogues = parseStringArray(row.example_dialogues);
  }

  return jsonResponse(body);
}

async function loadFavoriteSummary(
  env: Env,
  userId: string,
  companionId: string,
): Promise<FavoriteSummaryRow> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS favorite_count,
            MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS is_favorite
     FROM companion_favorites
     WHERE companion_id = ?`,
  )
    .bind(userId, companionId)
    .first<{ favorite_count: number | null; is_favorite: number | null }>();
  return {
    favorite_count: Number(row?.favorite_count ?? 0),
    is_favorite: Number(row?.is_favorite ?? 0),
  };
}

async function importCard(env: Env, user: UserRecord, body: unknown): Promise<Response> {
  const wrapper = isObject(body) ? body : {};
  // Accept either { card: <V2 card> } or the card object passed directly.
  const card = "card" in wrapper ? wrapper.card : body;
  const data = extractCardData(card);
  if (!data) {
    return jsonResponse({ error: "invalid_card" }, { status: 400 });
  }

  // Cards carry no gender; honour an explicit choice, otherwise default (the
  // user can flip it after import — it only drives emotion art).
  const gender = readGender(wrapper) ?? "female";
  const mapped = mapCardToCompanionInput(data, gender);
  if (!mapped) {
    return jsonResponse({ error: "invalid_card", field: "name" }, { status: 400 });
  }

  // Reuse the create path so quota, validation, and persistence stay identical.
  return createCompanion(env, user, mapped);
}

async function exportCard(env: Env, user: UserRecord, companionId: string): Promise<Response> {
  const row = await loadCompanion(env, companionId);
  if (!row || !canRead(row, user)) {
    return notFound();
  }

  return jsonResponse(
    companionToCard({
      background: row.background,
      example_dialogues: parseStringArray(row.example_dialogues),
      greeting: row.greeting,
      name: row.name,
      personality: row.personality,
      tags: parseStringArray(row.tags),
    }),
  );
}

async function createCompanion(env: Env, user: UserRecord, raw: unknown): Promise<Response> {
  const input = parseCreateInput(env, raw);
  if ("error" in input) {
    return input.response;
  }

  const activeCount = await countActiveUserCompanions(env, user.id);
  const pro = await isProUser(env, user.id);
  if (!pro && activeCount >= MAX_FREE_USER_COMPANIONS) {
    return jsonResponse(
      { error: "quota_exceeded", limit: MAX_FREE_USER_COMPANIONS, current: activeCount },
      { status: 402 },
    );
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO companions
      (id, source, created_by, is_active, name, appearance, personality,
       background, speech_style, voice_id, voice_speed, relationship_role, want, secret, boundary,
       greeting, example_dialogues, tags,
       preferred_scenes, art_url, art_emotions, gender, initial_dims,
       created_at, updated_at)
     VALUES (?, 'user', ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  )
    .bind(
      id,
      user.id,
      input.value.name,
      input.value.appearance ?? null,
      input.value.personality ?? null,
      input.value.background ?? null,
      input.value.speech_style ?? null,
      input.value.voice_id ?? defaultVoiceIdForGender(env, input.value.gender),
      input.value.voice_speed ?? defaultVoiceSpeed(env),
      input.value.relationship_role ?? null,
      input.value.want ?? null,
      input.value.secret ?? null,
      input.value.boundary ?? null,
      input.value.greeting ?? null,
      input.value.example_dialogues ? JSON.stringify(input.value.example_dialogues) : null,
      input.value.tags ? JSON.stringify(input.value.tags) : null,
      input.value.preferred_scenes ? JSON.stringify(input.value.preferred_scenes) : null,
      input.value.art_url ?? null,
      input.value.art_url
        ? JSON.stringify(neutralOnlyArtEmotions(input.value.art_url))
        : null,
      input.value.gender,
      now,
      now,
    )
    .run();

  const created = await loadCompanion(env, id);
  if (!created) {
    return jsonResponse({ error: "internal_error" }, { status: 500 });
  }

  return jsonResponse(serializeOwnCompanion(env, created), { status: 201 });
}

async function updateCompanion(
  env: Env,
  user: UserRecord,
  companionId: string,
  raw: unknown,
): Promise<Response> {
  const existing = await loadCompanion(env, companionId);
  if (!existing) {
    return notFound();
  }

  if (existing.source !== "user") {
    return jsonResponse({ error: "forbidden_official" }, { status: 403 });
  }

  if (existing.created_by !== user.id) {
    return jsonResponse({ error: "forbidden_not_owner" }, { status: 403 });
  }

  const patch = parseUpdateInput(env, raw);
  if ("error" in patch) {
    return patch.response;
  }

  const merged = {
    appearance: patch.value.appearance ?? existing.appearance,
    art_url: patch.value.art_url ?? existing.art_url,
    background: patch.value.background ?? existing.background,
    boundary: patch.value.boundary ?? existing.boundary,
    example_dialogues:
      patch.value.example_dialogues !== undefined
        ? JSON.stringify(patch.value.example_dialogues)
        : existing.example_dialogues,
    gender: patch.value.gender ?? existing.gender,
    greeting: patch.value.greeting ?? existing.greeting,
    name: patch.value.name ?? existing.name,
    personality: patch.value.personality ?? existing.personality,
    preferred_scenes:
      patch.value.preferred_scenes !== undefined
        ? JSON.stringify(patch.value.preferred_scenes)
        : existing.preferred_scenes,
    relationship_role: patch.value.relationship_role ?? existing.relationship_role,
    secret: patch.value.secret ?? existing.secret,
    speech_style: patch.value.speech_style ?? existing.speech_style,
    tags:
      patch.value.tags !== undefined ? JSON.stringify(patch.value.tags) : existing.tags,
    voice_id: patch.value.voice_id ?? existing.voice_id,
    voice_speed: patch.value.voice_speed ?? existing.voice_speed,
    want: patch.value.want ?? existing.want,
  };
  // spec-020: when the neutral art_url changes, drop all non-neutral
  // emotion entries — they were generated against the old base image and
  // would drift from the new one. New variations must be regenerated.
  const artUrlChanged =
    patch.value.art_url !== undefined && patch.value.art_url !== existing.art_url;
  let artEmotions: string | null;
  if (artUrlChanged) {
    artEmotions = merged.art_url
      ? JSON.stringify(neutralOnlyArtEmotions(merged.art_url))
      : null;
  } else {
    artEmotions = existing.art_emotions;
  }

  await env.DB.prepare(
    `UPDATE companions
     SET name = ?, appearance = ?, personality = ?, background = ?,
         speech_style = ?, relationship_role = ?, want = ?, secret = ?,
         boundary = ?, greeting = ?, example_dialogues = ?, tags = ?,
         preferred_scenes = ?, art_url = ?, art_emotions = ?,
         art_cutout_key = CASE WHEN ? THEN NULL ELSE art_cutout_key END,
         gender = ?, voice_id = ?, voice_speed = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      merged.name,
      merged.appearance,
      merged.personality,
      merged.background,
      merged.speech_style,
      merged.relationship_role,
      merged.want,
      merged.secret,
      merged.boundary,
      merged.greeting,
      merged.example_dialogues,
      merged.tags,
      merged.preferred_scenes,
      merged.art_url,
      artEmotions,
      artUrlChanged ? 1 : 0,
      merged.gender,
      merged.voice_id,
      merged.voice_speed ?? defaultVoiceSpeed(env),
      Date.now(),
      companionId,
    )
    .run();

  const updated = await loadCompanion(env, companionId);
  if (!updated) {
    return jsonResponse({ error: "internal_error" }, { status: 500 });
  }

  return jsonResponse(serializeOwnCompanion(env, updated));
}

async function deleteCompanion(env: Env, user: UserRecord, companionId: string): Promise<Response> {
  const existing = await loadCompanion(env, companionId);
  if (!existing) {
    return notFound();
  }

  if (existing.source !== "user") {
    return jsonResponse({ error: "forbidden_official" }, { status: 403 });
  }

  if (existing.created_by !== user.id) {
    return jsonResponse({ error: "forbidden_not_owner" }, { status: 403 });
  }

  if (existing.is_active === 0) {
    return new Response(null, { status: 204 });
  }

  await env.DB.prepare(
    `UPDATE companions SET is_active = 0, updated_at = ? WHERE id = ?`,
  )
    .bind(Date.now(), companionId)
    .run();

  return new Response(null, { status: 204 });
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function canRead(row: CompanionRow, user: UserRecord): boolean {
  if (row.is_active === 0) {
    return false;
  }
  if (row.source === "official") {
    return true;
  }
  // Published (public) companions are readable by anyone, like official ones.
  if (row.is_public === 1) {
    return true;
  }
  return row.created_by === user.id;
}

async function loadCompanion(env: Env, companionId: string): Promise<CompanionRow | null> {
  return env.DB.prepare(
    `SELECT id, source, created_by, is_active, is_public, name, appearance,
            personality, background, speech_style, relationship_role, want,
            secret, boundary, greeting, example_dialogues, tags, play_count,
            preferred_scenes, art_url, art_cutout_key, art_emotions, gender, voice_id, voice_speed,
            initial_dims, created_at, updated_at
     FROM companions
     WHERE id = ?`,
  )
    .bind(companionId)
    .first<CompanionRow>();
}

async function loadRelationship(
  env: Env,
  userId: string,
  companionId: string,
): Promise<RelationshipRow | null> {
  return env.DB.prepare(
    `SELECT closeness, trust, romance, friendship, hostility, tension, distance,
            level_label, first_met_at, last_interaction_at
     FROM relationships
     WHERE user_id = ? AND companion_id = ?`,
  )
    .bind(userId, companionId)
    .first<RelationshipRow>();
}

async function countActiveUserCompanions(env: Env, userId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM companions WHERE created_by = ? AND source = 'user' AND is_active = 1`,
  )
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

function serializeOwnCompanion(env: Env, row: CompanionRow): Record<string, unknown> {
  return {
    appearance: row.appearance,
    art_emotions: serializeArtEmotions(row.art_emotions),
    art_cutout_url: row.art_cutout_key,
    art_url: row.art_url,
    background: row.background,
    created_at: row.created_at,
    example_dialogues: parseStringArray(row.example_dialogues),
    gender: normalizeGender(row.gender),
    boundary: row.boundary,
    greeting: row.greeting,
    id: row.id,
    is_public: row.is_public === 1,
    name: row.name,
    personality: row.personality,
    play_count: row.play_count,
    preferred_scenes: parseStringArray(row.preferred_scenes),
    relationship_role: row.relationship_role,
    secret: row.secret,
    source: row.source,
    speech_style: row.speech_style,
    tags: parseStringArray(row.tags),
    updated_at: row.updated_at,
    voice_id: row.voice_id ?? defaultVoiceIdForGender(env, row.gender),
    voice_speed: normalizeVoiceSpeed(row.voice_speed) ?? defaultVoiceSpeed(env),
    want: row.want,
  };
}

function normalizeGender(raw: string | null | undefined): Gender | null {
  if (raw === "male" || raw === "female") return raw;
  return null;
}

type DiscoveryStyle = "anime" | "realistic";

function normalizeDiscoveryStyle(raw: string | null | undefined): DiscoveryStyle | null {
  if (raw === "anime" || raw === "realistic") return raw;
  return null;
}

function companionMatchesDiscoveryStyle(tags: string[], style: DiscoveryStyle): boolean {
  const normalized = new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean));
  if (style === "realistic") {
    return normalized.has("style:realistic") || normalized.has("realistic");
  }
  return normalized.has("style:anime") || normalized.has("anime");
}

type ParsedInput<T> = { value: T } | { error: true; response: Response };

type CreateValue = {
  name: string;
  gender: Gender;
  appearance?: string;
  personality?: string;
  background?: string;
  speech_style?: string;
  voice_id?: string;
  voice_speed?: VoiceSpeedId;
  relationship_role?: string;
  want?: string;
  secret?: string;
  boundary?: string;
  greeting?: string;
  example_dialogues?: string[];
  tags?: string[];
  preferred_scenes?: string[];
  art_url?: string;
};

function parseCreateInput(env: Env, raw: unknown): ParsedInput<CreateValue> {
  if (!isObject(raw)) {
    return invalid("invalid_body");
  }

  const name = readRequiredString(raw, "name", NAME_MAX);
  if (!name) {
    return invalid("name_required");
  }

  const gender = readGender(raw);
  if (!gender) {
    return invalid("gender_required");
  }

  const voiceId = readVoiceId(env, raw);
  if (voiceId === false) {
    return invalid("invalid_voice_id");
  }
  const voiceSpeed = readVoiceSpeed(raw);
  if (voiceSpeed === false) {
    return invalid("invalid_voice_speed");
  }

  return {
    value: {
      appearance: readOptionalText(raw, "appearance"),
      art_url: readOptionalText(raw, "art_url", 2048),
      background: readOptionalText(raw, "background"),
      example_dialogues: readOptionalStringArray(raw, "example_dialogues"),
      gender,
      greeting: readOptionalText(raw, "greeting"),
      name,
      personality: readOptionalText(raw, "personality"),
      preferred_scenes: readOptionalStringArray(raw, "preferred_scenes"),
      tags: readOptionalStringArray(raw, "tags"),
      relationship_role: readOptionalEnum(raw, "relationship_role", KNOWN_RELATIONSHIP_ROLES),
      secret: readOptionalText(raw, "secret"),
      speech_style: readOptionalText(raw, "speech_style"),
      voice_id: voiceId,
      voice_speed: voiceSpeed,
      want: readOptionalText(raw, "want"),
      boundary: readOptionalText(raw, "boundary"),
    },
  };
}

type UpdateValue = Partial<Omit<CreateValue, "gender">> & { gender?: Gender };

function parseUpdateInput(env: Env, raw: unknown): ParsedInput<UpdateValue> {
  if (!isObject(raw)) {
    return invalid("invalid_body");
  }

  const value: UpdateValue = {};

  if ("name" in raw) {
    const name = readRequiredString(raw, "name", NAME_MAX);
    if (!name) {
      return invalid("name_required");
    }
    value.name = name;
  }

  if ("appearance" in raw) value.appearance = readOptionalText(raw, "appearance");
  if ("personality" in raw) value.personality = readOptionalText(raw, "personality");
  if ("background" in raw) value.background = readOptionalText(raw, "background");
  if ("speech_style" in raw) value.speech_style = readOptionalText(raw, "speech_style");
  if ("voice_id" in raw) {
    const voiceId = readVoiceId(env, raw);
    if (voiceId === false) {
      return invalid("invalid_voice_id");
    }
    value.voice_id = voiceId;
  }
  if ("voice_speed" in raw) {
    const voiceSpeed = readVoiceSpeed(raw);
    if (voiceSpeed === false) {
      return invalid("invalid_voice_speed");
    }
    value.voice_speed = voiceSpeed;
  }
  if ("want" in raw) value.want = readOptionalText(raw, "want");
  if ("secret" in raw) value.secret = readOptionalText(raw, "secret");
  if ("boundary" in raw) value.boundary = readOptionalText(raw, "boundary");
  if ("greeting" in raw) value.greeting = readOptionalText(raw, "greeting");
  if ("example_dialogues" in raw) {
    value.example_dialogues = readOptionalStringArray(raw, "example_dialogues") ?? [];
  }
  if ("art_url" in raw) value.art_url = readOptionalText(raw, "art_url", 2048);
  if ("relationship_role" in raw) {
    value.relationship_role = readOptionalEnum(raw, "relationship_role", KNOWN_RELATIONSHIP_ROLES);
  }
  if ("preferred_scenes" in raw) {
    value.preferred_scenes = readOptionalStringArray(raw, "preferred_scenes") ?? [];
  }
  if ("tags" in raw) {
    value.tags = readOptionalStringArray(raw, "tags") ?? [];
  }
  if ("gender" in raw) {
    const gender = readGender(raw);
    if (!gender) {
      return invalid("invalid_gender");
    }
    value.gender = gender;
  }

  return { value };
}

function readGender(obj: Record<string, unknown>): Gender | null {
  const value = obj["gender"];
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return KNOWN_GENDERS.has(normalized as Gender) ? (normalized as Gender) : null;
}

function readVoiceId(env: Env, obj: Record<string, unknown>): string | undefined | false {
  const value = obj["voice_id"];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return isValidVoiceId(env, trimmed) ? trimmed : false;
}

function readVoiceSpeed(obj: Record<string, unknown>): VoiceSpeedId | undefined | false {
  const value = obj["voice_speed"];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return false;
  const normalized = normalizeVoiceSpeed(value.trim().toLowerCase());
  return normalized ?? false;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(error: string): { error: true; response: Response } {
  return { error: true, response: jsonResponse({ error }, { status: 400 }) };
}

function readRequiredString(obj: Record<string, unknown>, key: string, max: number): string | null {
  const value = obj[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function readOptionalText(obj: Record<string, unknown>, key: string, max = TEXT_FIELD_MAX): string | undefined {
  const value = obj[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function readOptionalEnum(
  obj: Record<string, unknown>,
  key: string,
  known: ReadonlySet<string>,
): string | undefined {
  const value = obj[key];
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return known.has(normalized) ? normalized : undefined;
}

function readOptionalStringArray(obj: Record<string, unknown>, key: string): string[] | undefined {
  const value = obj[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return strings.slice(0, 32);
}

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function serializeArtEmotions(raw: string | null | undefined): Record<string, string> | null {
  const map = parseArtEmotions(raw);
  return Object.keys(map).length > 0 ? map : null;
}
