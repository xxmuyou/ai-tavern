import { jsonResponse, readJson } from "./http";
import {
  isAdminEmail,
  optionalAuthEmail,
  optionalAuthUser,
  requireAdminUser,
  requireAuthEmail,
  requireAuthUser,
} from "./auth";
import { ensureUserByEmail, normalizeEmail, PLATFORM_APP_KEY, type UserRecord } from "./identity";
import { generateText, type LlmMessage } from "./llm";
import {
  characterDefinitionToSnapshot,
  toCharacterDefinition,
} from "./show-engine/domain/character-definition";
import {
  companionResponseLine as buildCompanionResponseLine,
  companionStoryScenes,
  readCompanionStoryOptions,
  shouldRequirePlatformPass,
} from "./show-engine/domain/companion-story-engine";
import {
  bindGuestAsset,
  guestPackageFromRow,
  guestPackageToCharacterFields,
  selectGuestVisualObjectKey,
  validateGuestCharacterPackage,
} from "./show-engine/domain/guest-character-package";
import {
  normalizeSelectedGuestKeys,
  resolveSelectedGuestLineup,
} from "./show-engine/domain/guest-lineup";
import {
  extractSignals,
  hardPreferenceBoost as calculateHardPreferenceBoost,
  tagsFromSignals,
} from "./show-engine/domain/signal-extractor";
import {
  applySignalsToGuest,
  countOverlap,
  reactionEventType,
  reactionLine,
} from "./show-engine/domain/rule-engine";
import {
  buildTurnDraft as buildDomainTurnDraft,
  composeTurnAnswer,
  sessionIdentitySummary,
} from "./show-engine/domain/stage-machine";
import type { GuestCharacterPackage } from "./show-engine/domain/types";

const DEFAULT_FREE_MESSAGE_LIMIT = 8;
export const DATING_SHOW_KEY = "dating-heart-signal";

type ShowEngineEnv = Env & {
  AI_TV_DATING_FREE_MESSAGE_LIMIT?: string;
};

type SystemAssetTarget =
  | { kind: "background" }
  | { characterKey: string; kind: "character" };

type BootstrapQuery = {
  email?: string;
};

type CreateSessionRequest = {
  ageRange?: string;
  avatarLabel?: string;
  avatarObjectKey?: string;
  email?: string;
  guestPreference?: AudiencePreference;
  hobbies?: string;
  occupation?: string;
  selectedGuestKeys?: string[];
  userCharacterKeys?: string[];
};

type MessageRequest = {
  email?: string;
  message?: string;
};

type TurnAnswerRequest = {
  ageRange?: string;
  email?: string;
  freeText?: string;
  hobbies?: string;
  occupation?: string;
  selectedCharacterKey?: string;
  selectedOptionId?: string;
  stream?: boolean;
};

type SpeechPreviewRequest = {
  email?: string;
  messageId?: string;
  speakerKey?: string | null;
  text?: string;
};

type TurnAnswerDeltaMeta = {
  speakerKey?: string | null;
  speakerName?: string | null;
};

type TurnAnswerOptions = {
  onDelta?: (text: string, meta?: TurnAnswerDeltaMeta) => void | Promise<void>;
  stream?: boolean;
};

type CompanionStoryAnswerRequest = {
  email?: string;
  freeText?: string;
  selectedOptionId?: string;
};

type AdvanceStageRequest = {
  email?: string;
  targetStage?: string;
};

type InitialPickRequest = {
  characterKey?: string;
  email?: string;
};

type ProfileJudgmentRequest = {
  ageRange?: string;
  email?: string;
  favoritePartnerType?: string;
  hobbies?: string;
  lifestyleNotes?: string;
  occupation?: string;
  relationshipValues?: string;
};

type UserDeclarationRequest = {
  declaration?: string;
  email?: string;
};

type FinalChoiceRequest = {
  characterKey?: string | null;
  email?: string;
  guestTemplateId?: string | null;
};

type CreateCharacterRequest = {
  ageRange?: string;
  avatarObjectKey?: string;
  cityOrLifestyle?: string;
  dealbreakers?: string;
  dislikedPartnerTraits?: string;
  email?: string;
  favoritePartnerTraits?: string;
  gender?: "male" | "female";
  hobbies?: string;
  name?: string;
  occupation?: string;
  personalityKeywords?: string;
  speakingStyle?: string;
  characterPackage?: GuestCharacterPackage;
};

type CharacterPackageRequest = {
  characterPackage?: GuestCharacterPackage;
  email?: string;
  package?: GuestCharacterPackage;
};

type CharacterAssetRequest = {
  email?: string;
  objectKey?: string;
  slot?: "avatar" | "gallery" | "portrait" | "visual_state";
  visualStateKey?: string;
};

type PublishCharacterRequest = {
  email?: string;
  visibility?: "private" | "public";
};

type WorkspaceGuestRequest = {
  acquisitionMethod?: "community_added" | "created" | "joined_home" | "system_default" | "unlocked";
  characterKey?: string;
  email?: string;
};

type AudiencePreference = "male" | "female" | "any";
type SessionStatus = "active" | "completed";
type CharacterRole = "host" | "guest" | "support";
type MessageRole = "user" | "host" | "character" | "system";
type TurnStatus = "awaiting_user" | "answered" | "skipped";
type ShowEventType =
  | "blow_up"
  | "guest_doubt"
  | "guest_heart"
  | "guest_object"
  | "guest_question"
  | "guest_reaction"
  | "host_opening"
  | "host_summary"
  | "light_off"
  | "semantic_judgment"
  | "stage_change"
  | "user_answer";

type ShowTemplateRow = {
  app_key: string;
  background_image_key: string | null;
  config: string;
  default_avatar_options: string;
  ending_rules: string;
  opening_scene: string;
  premise: string;
  show_key: string;
  show_type: string;
  subtitle: string | null;
  title: string;
};

type ShowCharacterRow = {
  avatar_object_key: string | null;
  blow_up_signals: string;
  boundaries: string;
  character_key: string;
  dealbreaker_signals: string;
  gender: "male" | "female" | null;
  goal: string;
  hard_preference_signals: string;
  hidden_preferences: string;
  initial_affinity: number;
  match_threshold: number;
  name: string;
  negative_signals: string;
  owner_user_id: string | null;
  personality: string;
  positive_signals: string;
  public_profile: string;
  relationship_to_user: string;
  role: CharacterRole;
  soft_preference_signals: string;
  source: "official" | "user";
  speaking_style: string;
};

type ShowStageRow = {
  allowed_user_actions: string;
  auto_advance_after_messages: number | null;
  goal: string;
  host_instruction: string;
  is_final: number;
  stage_key: string;
  stage_order: number;
  title: string;
};

type ShowSessionRow = {
  app_key: string;
  audience_preference: AudiencePreference;
  avatar_label: string;
  avatar_object_key: string | null;
  current_stage_key: string;
  id: string;
  initial_pick_character_key: string | null;
  match_success: number;
  message_count: number;
  points_awarded: number;
  result_summary: string | null;
  selected_character_key: string | null;
  show_key: string;
  status: SessionStatus;
  updated_at: string;
  user_declaration: string | null;
  user_id: string;
  user_profile: string;
};

type SessionCharacterRow = {
  affinity_score: number;
  character_key: string;
  dealbreaker_triggered: number;
  is_available: number;
  light_state: "on" | "off" | "blow_up";
  name: string;
  role: CharacterRole;
  snapshot: string;
  strong_signal_count: number;
};

type ShowMessageRow = {
  content: string;
  created_at: string;
  id: string;
  role: MessageRole;
  speaker_key: string | null;
  speaker_name: string;
  stage_key: string;
};

type ShowTurnRow = {
  answer_text: string | null;
  created_at: string;
  id: string;
  options: string;
  question: string;
  selected_character_key: string | null;
  selected_option_id: string | null;
  speaker_key: string | null;
  speaker_name: string;
  stage_key: string;
  status: TurnStatus;
  turn_index: number;
  updated_at: string;
};

type ShowEventRow = {
  content: string;
  created_at: string;
  data: string;
  event_order: number;
  event_type: ShowEventType;
  id: string;
  speaker_key: string | null;
  speaker_name: string;
  stage_key: string;
  turn_id: string | null;
};

type WorkspaceAssetRow = {
  content_type: string | null;
  created_at: string;
  key: string;
  size_bytes: number | null;
};

type UserGuestAssetRow = {
  acquisition_method: string;
  app_key: string;
  character_key: string;
  created_at: string;
  id: string;
  show_key: string;
  source: "community" | "official" | "user";
  status: "active" | "archived";
  updated_at: string;
  user_id: string;
};

type WorkspacePointEventRow = {
  created_at: string;
  event_type: string;
  points: number;
};

type UserShowProfileRow = {
  age_range: string;
  avatar_object_key: string | null;
  derived_tags: string;
  hobbies: string;
  occupation: string;
  updated_at: string;
};

type UserCompanionRow = {
  app_key: string;
  character_key: string;
  created_at: string;
  id: string;
  last_story_at: string | null;
  relationship_state: string;
  show_key: string;
  snapshot: string;
  source_session_id: string;
  story_turn_count: number;
  unlock_status: string;
  updated_at: string;
  user_id: string;
};

type CompanionStoryTurnRow = {
  answer_text: string | null;
  created_at: string;
  id: string;
  options: string;
  prompt: string;
  response_text: string | null;
  scene_title: string;
  selected_option_id: string | null;
  status: "awaiting_user" | "answered";
  turn_index: number;
  updated_at: string;
};

type WorkspaceSessionRow = Pick<
  ShowSessionRow,
  | "audience_preference"
  | "avatar_label"
  | "avatar_object_key"
  | "current_stage_key"
  | "id"
  | "match_success"
  | "message_count"
  | "points_awarded"
  | "result_summary"
  | "selected_character_key"
  | "show_key"
  | "status"
  | "updated_at"
>;

type CharacterSnapshot = ReturnType<typeof serializeCharacter>;

type TurnOption = {
  id: string;
  label: string;
  preview: string;
  signalText: string;
};

type CompanionStoryOption = {
  id: string;
  label: string;
  preview: string;
};

type TurnDraft = {
  options: TurnOption[];
  question: string;
  speakerKey: string;
  speakerName: string;
  stageKey: string;
};

type SignalApplication = {
  attractionTags?: string[];
  characterKey: string;
  dealbreakerHits: number;
  dealbreakerTriggered: boolean;
  delta: number;
  name: string;
  negativeHits: number;
  nextAffinity: number;
  nextLightState: "on" | "off" | "blow_up";
  nextStrongSignalCount: number;
  positiveHits: number;
  previousLightState: "on" | "off" | "blow_up";
  reason?: string;
  riskTags?: string[];
};

type SemanticGuestJudgment = {
  attractionTags: string[];
  characterKey: string;
  delta: number;
  reason: string;
  riskTags: string[];
};

type SemanticTurnJudgment = {
  expressionTraits: string[];
  guestJudgments: SemanticGuestJudgment[];
  source: "fallback" | "llm";
  userIntent: string;
};

type GeneratedReaction = {
  characterKey: string;
  reason: string;
  text: string;
};

export async function handleShowRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname === "/shows" && request.method === "GET") {
    return jsonResponse(await listShows(env as ShowEngineEnv));
  }

  if (!pathname.startsWith("/shows/")) {
    return null;
  }

  const engineEnv = env as ShowEngineEnv;
  const pathMatch = pathname.match(/^\/shows\/([^/]+)(?:\/(.*))?$/);
  const showKey = decodeURIComponent(pathMatch?.[1] ?? "");
  const restPath = pathMatch?.[2] ? `/${pathMatch[2]}` : "/";

  return handleShowScopedRequest(request, engineEnv, showKey, restPath);
}

export async function handleDatingCompatRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const appBasePath = "/apps/ai-tv-dating";
  if (!pathname.startsWith(appBasePath)) {
    return null;
  }

  const restPath = pathname.slice(appBasePath.length) || "/";
  return handleShowScopedRequest(request, env as ShowEngineEnv, DATING_SHOW_KEY, restPath);
}

export async function handleCompanionRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const match = pathname.match(/^\/companions\/([^/]+)\/story(?:\/turns\/([^/]+)\/answer)?$/);
  if (!match) {
    return null;
  }

  const companionId = decodeURIComponent(match[1] ?? "");
  const turnId = match[2] ? decodeURIComponent(match[2]) : null;
  if (!companionId) {
    return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
  }

  if (!turnId && request.method === "GET") {
    const url = new URL(request.url);
    const user = await requireAuthUser(env, request, url.searchParams.get("email"));
    return jsonResponse(await getCompanionStory(env as ShowEngineEnv, companionId, user));
  }

  if (turnId && request.method === "POST") {
    const body = await readJson<CompanionStoryAnswerRequest>(request);
    body.email = await requireAuthEmail(env, request, body.email);
    return jsonResponse(await answerCompanionStoryTurn(env as ShowEngineEnv, companionId, turnId, body));
  }

  return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
}

async function handleShowScopedRequest(
  request: Request,
  env: ShowEngineEnv,
  showKey: string,
  restPath: string,
): Promise<Response> {
  if (restPath === "/bootstrap" && request.method === "GET") {
    const url = new URL(request.url);
    const email = await optionalAuthEmail(env, request, url.searchParams.get("email"));
    return jsonResponse(await getBootstrap(env, showKey, { email }));
  }

  if (restPath === "/characters" && request.method === "GET") {
    const url = new URL(request.url);
    const user = await optionalAuthUser(env, request, url.searchParams.get("email"));
    return jsonResponse(await getCharacterLibrary(env, showKey, user));
  }

  if (restPath === "/workspace" && request.method === "GET") {
    const url = new URL(request.url);
    const user = await requireAuthUser(env, request, url.searchParams.get("email"));
    return jsonResponse(await getWorkspace(env, showKey, user));
  }

  if (restPath === "/workspace/guests" && request.method === "POST") {
    const body = await readJson<WorkspaceGuestRequest>(request);
    body.email = await requireAuthEmail(env, request, body.email);
    return jsonResponse(await joinWorkspaceGuest(env, showKey, body), { status: 201 });
  }

  const systemAssetMatch = restPath.match(/^\/admin\/system-assets\/(?:background|characters\/([^/]+))$/);
  if (systemAssetMatch) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }

    const admin = await requireAdminUser(env, request);
    const characterKey = systemAssetMatch[1] ? normalizeCharacterKeyValue(decodeURIComponent(systemAssetMatch[1])) : "";
    const target: SystemAssetTarget = characterKey
      ? { characterKey, kind: "character" }
      : { kind: "background" };
    return jsonResponse(await uploadSystemAsset(env, showKey, target, request, admin), { status: 201 });
  }

  if (restPath === "/characters" && request.method === "POST") {
    const body = await readJson<CreateCharacterRequest>(request);
    body.email = await requireAuthEmail(env, request, body.email);
    return jsonResponse(await createUserCharacter(env, showKey, body), { status: 201 });
  }

  if (restPath === "/characters/validate" && request.method === "POST") {
    const body = await readJson<CharacterPackageRequest>(request);
    const validation = validateGuestCharacterPackage(body.characterPackage ?? body.package ?? body);
    return jsonResponse({
      characterPackage: validation.package,
      errors: validation.errors,
      ok: validation.errors.length === 0,
    });
  }

  const characterMatch = restPath.match(/^\/characters\/([^/]+)(?:\/(package|assets|publish))?$/);
  if (characterMatch) {
    const characterKey = decodeURIComponent(characterMatch[1] ?? "");
    const action = characterMatch[2] ?? "";

    if (action === "package" && request.method === "GET") {
      const url = new URL(request.url);
      const user = await requireAuthUser(env, request, url.searchParams.get("email"));
      return jsonResponse(await getUserCharacterPackage(env, showKey, characterKey, user));
    }

    if (!action && request.method === "PATCH") {
      const body = await readJson<CharacterPackageRequest>(request);
      body.email = await requireAuthEmail(env, request, body.email);
      return jsonResponse(await updateUserCharacterPackage(env, showKey, characterKey, body));
    }

    if (action === "assets" && request.method === "POST") {
      const body = await readJson<CharacterAssetRequest>(request);
      body.email = await requireAuthEmail(env, request, body.email);
      return jsonResponse(await bindUserCharacterAsset(env, showKey, characterKey, body));
    }

    if (action === "publish" && request.method === "POST") {
      const body = await readJson<PublishCharacterRequest>(request);
      body.email = await requireAuthEmail(env, request, body.email);
      return jsonResponse(await publishUserCharacter(env, showKey, characterKey, body));
    }

    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  if (restPath === "/sessions" && request.method === "POST") {
    const body = await readJson<CreateSessionRequest>(request);
    body.email = await requireAuthEmail(env, request, body.email);
    return jsonResponse(await createSession(env, showKey, body), { status: 201 });
  }

  const sessionMatch = restPath.match(/^\/sessions\/([^/]+)(?:\/(.+))?$/);
  if (!sessionMatch) {
    return jsonResponse({ error: "not_found" }, { status: 404 });
  }

  const sessionId = decodeURIComponent(sessionMatch[1] ?? "");
  const actionPath = sessionMatch[2] ?? "";
  const action = actionPath.split("/")[0] ?? "";

  if (!action && request.method === "GET") {
    const url = new URL(request.url);
    const user = await requireAuthUser(env, request, url.searchParams.get("email"));
    return jsonResponse(await getSessionPayload(env, showKey, sessionId, user));
  }

  const turnMatch = actionPath.match(/^turns\/([^/]+)\/answer$/);
  if (turnMatch && request.method === "POST") {
    const url = new URL(request.url);
    const turnId = decodeURIComponent(turnMatch[1] ?? "");
    const body = await readJson<TurnAnswerRequest>(request);
    body.email = await requireAuthEmail(env, request, body.email);
    if (shouldStreamTurnAnswer(url, body)) {
      return streamTurnAnswer(env, showKey, sessionId, turnId, body);
    }

    return jsonResponse(await answerTurn(env, showKey, sessionId, turnId, body));
  }

  if (action === "messages" && request.method === "POST") {
    const body = await readJson<MessageRequest>(request);
    body.email = await requireAuthEmail(env, request, body.email);
    return jsonResponse(await addMessage(env, showKey, sessionId, body));
  }

  if (action === "speech-preview" && request.method === "POST") {
    const body = await readJson<SpeechPreviewRequest>(request);
    body.email = await requireAuthEmail(env, request, body.email);
    return jsonResponse(await previewSessionSpeech(env, showKey, sessionId, body));
  }

  if (action === "advance" && request.method === "POST") {
    const body = await readJson<AdvanceStageRequest>(request);
    body.email = await requireAuthEmail(env, request, body.email);
    return jsonResponse(await advanceStage(env, showKey, sessionId, body));
  }

  if (action === "initial-pick" && request.method === "POST") {
    const body = await readJson<InitialPickRequest>(request);
    body.email = await requireAuthEmail(env, request, body.email);
    return jsonResponse(await submitInitialPick(env, showKey, sessionId, body));
  }

  if (action === "profile" && request.method === "POST") {
    const body = await readJson<ProfileJudgmentRequest>(request);
    body.email = await requireAuthEmail(env, request, body.email);
    return jsonResponse(await submitProfileJudgment(env, showKey, sessionId, body));
  }

  if (action === "declaration" && request.method === "POST") {
    const body = await readJson<UserDeclarationRequest>(request);
    body.email = await requireAuthEmail(env, request, body.email);
    return jsonResponse(await submitUserDeclaration(env, showKey, sessionId, body));
  }

  if (action === "final-choice" && request.method === "POST") {
    const body = await readJson<FinalChoiceRequest>(request);
    body.email = await requireAuthEmail(env, request, body.email);
    return jsonResponse(await finalizeSession(env, showKey, sessionId, body));
  }

  return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
}

function shouldStreamTurnAnswer(url: URL, body: TurnAnswerRequest): boolean {
  const streamParam = url.searchParams.get("stream");
  if (streamParam && ["1", "true", "yes"].includes(streamParam.toLowerCase())) {
    return true;
  }

  return body.stream === true;
}

function streamTurnAnswer(
  env: ShowEngineEnv,
  showKey: string,
  sessionId: string,
  turnId: string,
  body: TurnAnswerRequest,
): Response {
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  const writeEvent = async (event: string, data: unknown) => {
    await writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  };

  void (async () => {
    try {
      await writeEvent("start", { sessionId, turnId });
      const payload = await answerTurn(env, showKey, sessionId, turnId, body, {
        onDelta: (text, meta) => writeEvent("delta", {
          speakerKey: meta?.speakerKey ?? null,
          speakerName: meta?.speakerName ?? null,
          text,
        }),
        stream: true,
      });
      await writeEvent("session", payload);
    } catch (error) {
      await writeEvent("error", await serializeStreamError(error));
    } finally {
      await writer.close().catch(() => undefined);
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "cache-control": "no-cache, no-transform",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
    },
  });
}

async function serializeStreamError(error: unknown) {
  if (error instanceof Response) {
    return {
      error: (await error.clone().text().catch(() => "")) || error.statusText || "stream_error",
      status: error.status,
    };
  }

  return {
    error: error instanceof Error ? error.message : String(error),
    status: 500,
  };
}

async function listShows(env: ShowEngineEnv) {
  const { results } = await env.DB.prepare(
    `SELECT show_key, app_key, title, subtitle, show_type, premise, background_image_key
     FROM show_templates
     WHERE status = ?
     ORDER BY sort_order ASC, show_key ASC`,
  )
    .bind("active")
    .all<Pick<ShowTemplateRow, "app_key" | "background_image_key" | "premise" | "show_key" | "show_type" | "subtitle" | "title">>();

  return {
    shows: results.map((show) => ({
      appKey: show.app_key,
      backgroundImageKey: show.background_image_key,
      premise: show.premise,
      showKey: show.show_key,
      showType: show.show_type,
      subtitle: show.subtitle,
      title: show.title,
    })),
  };
}

async function getBootstrap(env: ShowEngineEnv, showKey: string, query: BootstrapQuery) {
  const email = normalizeEmail(query.email);
  const user = email ? await ensureUserByEmail(env, email) : null;
  const [show, stages, characters] = await Promise.all([
    requireShow(env, showKey),
    getStages(env, showKey),
    getCharacters(env, showKey, "any", user),
  ]);
  const guests = characters.filter((character) => character.role === "guest");

  return {
    appKey: show.app_key,
    appName: show.title,
    characters: characters.map(serializePublicCharacter),
    chapterOne: {
      slotCount: readChapterOneSlotCount(show),
    },
    defaultAvatars: readJsonArray<{ label: string; objectKey: string }>(show.default_avatar_options),
    entitlement: user ? await getEntitlement(env, user, show) : freeEntitlement(env, show),
    guestPreferences: ["female", "male", "any"] satisfies AudiencePreference[],
    guests: guests.map(serializePublicCharacter),
    userCharacters: characters.filter((character) => isOwnedCharacter(character, user)).map(serializePublicCharacter),
    show: serializeShow(show),
    stages: stages.map(serializeStage),
    user: user ? { email: user.email, id: user.id } : null,
  };
}

async function getCharacterLibrary(env: ShowEngineEnv, showKey: string, user: UserRecord | null) {
  const characters = await getCharacters(env, showKey, "any", user);

  return {
    characters: characters.map(serializePublicCharacter),
    officialCharacters: characters.filter((character) => character.source === "official").map(serializePublicCharacter),
    communityCharacters: characters.filter((character) => isCommunityCharacter(character)).map(serializePublicCharacter),
    userCharacters: characters.filter((character) => isOwnedCharacter(character, user)).map(serializePublicCharacter),
  };
}

async function getWorkspace(env: ShowEngineEnv, showKey: string, user: UserRecord) {
  const show = await requireShow(env, showKey);
  const [characters, sessions, points, entitlement, profile, companions, guestAssets] = await Promise.all([
    getCharacters(env, showKey, "any", user),
    getRecentSessions(env, show, user),
    getPointSummary(env, show, user),
    getEntitlement(env, user, show),
    getUserShowProfile(env, show, user),
    getUserCompanions(env, show, user),
    getUserGuestAssets(env, showKey, user),
  ]);
  const userCharacters = characters.filter((character) => isOwnedCharacter(character, user));
  const assetByCharacterKey = new Map(guestAssets.map((asset) => [asset.character_key, asset]));
  const joinedGuests = characters.filter((character) => character.role === "guest" && assetByCharacterKey.has(character.character_key));
  const workspaceCharacters = uniqueCharacters([...joinedGuests, ...userCharacters]);
  const assetKeys = uniqueStrings([
    ...workspaceCharacters.flatMap(characterAssetKeys),
    ...sessions.map((session) => session.avatar_object_key),
    ...companions.map((companion) => companion.avatarObjectKey),
  ]);
  const assets = await getAssetSummary(env, assetKeys);
  const admin = isAdminEmail(env, user.email);

  return {
    admin: {
      isAdmin: admin,
      systemAssets: admin ? serializeSystemAssets(show, characters) : [],
    },
    assets,
    characters: workspaceCharacters.map(serializePublicCharacter),
    chapterOne: {
      slotCount: readChapterOneSlotCount(show),
    },
    companions,
    entitlement,
    guestAssets: joinedGuests.map((character) => ({
      ...serializePublicCharacter(character),
      asset: serializeUserGuestAsset(assetByCharacterKey.get(character.character_key)),
    })),
    points,
    profile: profile ? serializeUserShowProfile(profile) : {
      avatarObjectKey: sessions.find((session) => session.avatar_object_key)?.avatar_object_key ?? null,
      derivedTags: [],
      displayName: user.email.split("@")[0] ?? "Player",
      hardIdentity: {
        ageRange: "",
        hobbies: [],
        occupation: "",
      },
    },
    recentSessions: sessions.map(serializeWorkspaceSession),
    show: serializeShow(show),
    user: {
      email: user.email,
      id: user.id,
    },
    userCharacters: userCharacters.map(serializePublicCharacter),
  };
}

async function joinWorkspaceGuest(env: ShowEngineEnv, showKey: string, body: WorkspaceGuestRequest) {
  const email = normalizeEmail(body.email);
  const characterKey = normalizeCharacterKeyValue(body.characterKey);
  if (!email) {
    throw new Response("email_required", { status: 400 });
  }
  if (!characterKey) {
    throw new Response("character_key_required", { status: 400 });
  }

  const [show, user] = await Promise.all([
    requireShow(env, showKey),
    ensureUserByEmail(env, email),
  ]);
  const characters = await getCharacters(env, showKey, "any", user);
  const character = characters.find((item) => item.character_key === characterKey);
  if (!character) {
    throw new Response("character_not_found", { status: 404 });
  }
  if (character.role !== "guest") {
    throw new Response("guest_required", { status: 400 });
  }

  const assetSource = guestAssetSource(character, user);
  const acquisitionMethod = normalizeGuestAcquisitionMethod(
    body.acquisitionMethod,
    assetSource === "community" ? "community_added" : "joined_home",
  );
  await env.DB.prepare(
    `INSERT INTO user_guest_assets (
       id, app_key, show_key, user_id, character_key, source, acquisition_method, status, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, show_key, character_key) DO UPDATE SET
       source = excluded.source,
       acquisition_method = excluded.acquisition_method,
       status = 'active',
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(crypto.randomUUID(), show.app_key, show.show_key, user.id, character.character_key, assetSource, acquisitionMethod)
    .run();

  return getWorkspace(env, showKey, user);
}

async function getUserGuestAssets(env: ShowEngineEnv, showKey: string, user: UserRecord): Promise<UserGuestAssetRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, app_key, show_key, user_id, character_key, source, acquisition_method, status, created_at, updated_at
     FROM user_guest_assets
     WHERE user_id = ? AND show_key = ? AND status = 'active'
     ORDER BY updated_at DESC, created_at DESC`,
  )
    .bind(user.id, showKey)
    .all<UserGuestAssetRow>();

  return results;
}

function guestAssetSource(character: ShowCharacterRow, user: UserRecord): UserGuestAssetRow["source"] {
  if (character.source === "official") {
    return "official";
  }

  return character.owner_user_id === user.id ? "user" : "community";
}

function serializeUserGuestAsset(asset: UserGuestAssetRow | undefined) {
  if (!asset) {
    return null;
  }

  return {
    acquisitionMethod: asset.acquisition_method,
    characterKey: asset.character_key,
    createdAt: asset.created_at,
    id: asset.id,
    source: asset.source,
    status: asset.status,
    updatedAt: asset.updated_at,
  };
}

async function uploadSystemAsset(
  env: ShowEngineEnv,
  showKey: string,
  target: SystemAssetTarget,
  request: Request,
  admin: UserRecord,
) {
  if (!request.body) {
    throw jsonResponse({ error: "missing_body" }, { status: 400 });
  }

  const contentType = request.headers.get("content-type") ?? "application/octet-stream";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw jsonResponse({ error: "image_content_type_required" }, { status: 400 });
  }

  const show = await requireShow(env, showKey);
  if (target.kind === "character") {
    await requireOfficialSystemCharacter(env, showKey, target.characterKey);
  }

  const sizeBytes = Number(request.headers.get("content-length") ?? "0") || undefined;
  const objectKey = systemAssetObjectKey(showKey, target, contentType);
  await env.ASSETS.put(objectKey, request.body, {
    customMetadata: {
      actorEmail: admin.email,
      source: "show-admin",
    },
    httpMetadata: {
      contentType,
    },
  });
  await recordUploadedAsset(env, objectKey, contentType, sizeBytes);

  if (target.kind === "background") {
    await env.DB.prepare(
      `UPDATE show_templates
       SET background_image_key = ?, updated_at = CURRENT_TIMESTAMP
       WHERE show_key = ?`,
    )
      .bind(objectKey, show.show_key)
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE show_characters
       SET avatar_object_key = ?
       WHERE show_key = ? AND character_key = ? AND source = ? AND status = ?`,
    )
      .bind(objectKey, show.show_key, target.characterKey, "official", "active")
      .run();
  }

  await insertShowAdminAudit(env, admin.email, "replace_system_asset", target.kind, target.kind === "background" ? "background" : target.characterKey, {
    contentType,
    objectKey,
    sizeBytes,
    showKey: show.show_key,
  });

  const [updatedShow, characters] = await Promise.all([
    requireShow(env, showKey),
    getCharacters(env, showKey, "any", null),
  ]);

  return {
    asset: {
      contentType,
      objectKey,
      sizeBytes: sizeBytes ?? null,
    },
    systemAssets: serializeSystemAssets(updatedShow, characters),
  };
}

async function requireOfficialSystemCharacter(env: ShowEngineEnv, showKey: string, characterKey: string): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT character_key
     FROM show_characters
     WHERE show_key = ? AND character_key = ? AND source = ? AND status = ? AND role IN (?, ?)
     LIMIT 1`,
  )
    .bind(showKey, characterKey, "official", "active", "host", "guest")
    .first<{ character_key: string }>();

  if (!row) {
    throw jsonResponse({ error: "system_character_not_found" }, { status: 404 });
  }
}

async function recordUploadedAsset(
  env: ShowEngineEnv,
  objectKey: string,
  contentType: string,
  sizeBytes: number | undefined,
): Promise<void> {
  await env.DB.prepare(
    "INSERT OR REPLACE INTO asset_objects (key, content_type, size_bytes) VALUES (?, ?, ?)",
  )
    .bind(objectKey, contentType, sizeBytes ?? null)
    .run();

  await env.JOB_QUEUE.send({
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    key: objectKey,
    type: "asset.uploaded",
  });
}

async function insertShowAdminAudit(
  env: ShowEngineEnv,
  actorEmail: string,
  action: string,
  targetType: string,
  targetKey: string,
  payload: unknown,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO admin_audit_events (
       id, actor_email, action, target_type, target_key, payload_json
     )
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), actorEmail, action, targetType, targetKey, JSON.stringify(payload ?? {}))
    .run();
}

function serializeSystemAssets(show: ShowTemplateRow, characters: ShowCharacterRow[]) {
  const officialCharacters = characters
    .filter((character) => character.source === "official" && (character.role === "host" || character.role === "guest"))
    .sort((left, right) => roleSort(left.role) - roleSort(right.role) || left.name.localeCompare(right.name));

  return [
    {
      characterKey: null,
      kind: "background",
      label: "Studio background",
      objectKey: show.background_image_key,
      role: "background",
    },
    ...officialCharacters.map((character) => ({
      characterKey: character.character_key,
      kind: "character",
      label: character.name,
      objectKey: character.avatar_object_key,
      role: character.role,
    })),
  ];
}

function roleSort(role: CharacterRole | "background"): number {
  if (role === "background") {
    return 0;
  }

  return role === "host" ? 1 : 2;
}

function systemAssetObjectKey(showKey: string, target: SystemAssetTarget, contentType: string): string {
  const extension = imageExtension(contentType);
  const targetKey = target.kind === "background" ? "background" : target.characterKey;
  const key = `apps/ai-companion/${showKey}/system/${target.kind}/${targetKey}-${Date.now()}-${crypto.randomUUID()}.${extension}`;
  return normalizeObjectKey(key) ?? `apps/ai-companion/${showKey}/system/${crypto.randomUUID()}.${extension}`;
}

function imageExtension(contentType: string): string {
  const normalized = contentType.toLowerCase().split(";")[0]?.trim();
  if (normalized === "image/jpeg" || normalized === "image/jpg") {
    return "jpg";
  }
  if (normalized === "image/webp") {
    return "webp";
  }
  if (normalized === "image/gif") {
    return "gif";
  }

  return "png";
}

function normalizeGuestAcquisitionMethod(value: unknown, fallback: UserGuestAssetRow["acquisition_method"]) {
  return value === "community_added" ||
    value === "created" ||
    value === "joined_home" ||
    value === "system_default" ||
    value === "unlocked"
    ? value
    : fallback;
}

async function createUserCharacter(env: ShowEngineEnv, showKey: string, body: CreateCharacterRequest) {
  const email = normalizeEmail(body.email);
  if (!email) {
    throw new Response("email_required", { status: 400 });
  }

  const user = await ensureUserByEmail(env, email);
  await requireShow(env, showKey);

  if (body.characterPackage) {
    const validation = validateGuestCharacterPackage(body.characterPackage);
    if (validation.errors.length > 0) {
      throw jsonResponse({ error: "invalid_character_package", errors: validation.errors }, { status: 400 });
    }

    validation.package.publicProfile = {
      ...validation.package.publicProfile,
      visibility: "private",
    };
    const fields = guestPackageToCharacterFields(validation.package);
    const characterKey = `user-${user.id.slice(0, 8)}-${slugify(fields.name)}-${Date.now().toString(36)}`;
    await insertUserCharacter(env, showKey, user, characterKey, fields);

    const created = await requireOwnedUserCharacter(env, showKey, characterKey, user);
    return serializeCharacterPackageResponse(created);
  }

  const name = normalizeShortText(body.name, "", 80);
  const gender = body.gender === "male" || body.gender === "female" ? body.gender : null;
  if (!name || !gender) {
    throw new Response("name_and_gender_required", { status: 400 });
  }

  const traitsText = [
    body.favoritePartnerTraits,
    body.dislikedPartnerTraits,
    body.dealbreakers,
    body.personalityKeywords,
    body.hobbies,
  ].join(" ");
  const signals = extractSignals(traitsText);
  const characterKey = `user-${user.id.slice(0, 8)}-${slugify(name)}-${Date.now().toString(36)}`;
  const publicProfile = {
    ageRange: normalizeShortText(body.ageRange, "25-35", 40),
    cityOrLifestyle: normalizeShortText(body.cityOrLifestyle, "city life", 80),
    dealbreakers: splitUserList(body.dealbreakers),
    hobbies: splitUserList(body.hobbies),
    occupationTag: normalizeShortText(body.occupation, "creator", 80),
    personalityKeywords: splitUserList(body.personalityKeywords),
    preferences: splitUserList(body.favoritePartnerTraits),
    visibility: "private",
  };
  const characterPackage = validateGuestCharacterPackage({
    assets: {
      avatarObjectKey: normalizeObjectKey(body.avatarObjectKey),
      galleryObjectKeys: [],
      portraitObjectKey: normalizeObjectKey(body.avatarObjectKey),
      visualStates: {},
    },
    identity: {
      ageRange: publicProfile.ageRange,
      cityOrLifestyle: publicProfile.cityOrLifestyle,
      gender,
      hobbies: publicProfile.hobbies,
      name,
      occupation: publicProfile.occupationTag,
    },
    matchRules: {
      blowUpSignals: signals.positiveSignals.slice(0, 3),
      dealbreakerSignals: signals.dealbreakerSignals.length ? signals.dealbreakerSignals : ["aggression"],
      hardPreferenceSignals: [],
      initialAffinity: 50,
      matchThreshold: 75,
      negativeSignals: signals.negativeSignals.length ? signals.negativeSignals : ["avoidance"],
      positiveSignals: signals.positiveSignals.length ? signals.positiveSignals : ["honesty", "kindness"],
      softPreferenceSignals: signals.positiveSignals.length ? signals.positiveSignals : ["honesty", "kindness"],
    },
    persona: {
      boundaries: normalizeShortText(body.dealbreakers, "Avoid disrespect, aggression, and dishonesty.", 240),
      goal: "Discover whether the user matches this character's stated values and hidden preferences.",
      hiddenPreferences: normalizeShortText(body.favoritePartnerTraits, "", 240),
      personality: normalizeShortText(body.personalityKeywords, "open, curious, emotionally present", 240),
      relationshipToUser: "A user-created companion character for the opening story.",
      speakingStyle: normalizeShortText(body.speakingStyle, "natural, concise, emotionally clear", 160),
    },
    publicProfile,
    stateModel: {
      coefficients: {},
      runtimeDefaults: {
        action: "idle",
        curiosity: 50,
        energy: 50,
        expression: "neutral",
        intimacy: 0,
        mood: "neutral",
      },
    },
  }).package;

  await insertUserCharacter(env, showKey, user, characterKey, guestPackageToCharacterFields(characterPackage));

  const created = await requireOwnedUserCharacter(env, showKey, characterKey, user);
  return serializeCharacterPackageResponse(created);
}

async function insertUserCharacter(
  env: ShowEngineEnv,
  showKey: string,
  user: UserRecord,
  characterKey: string,
  fields: ReturnType<typeof guestPackageToCharacterFields>,
) {
  const publicProfile = withCharacterVisibility(fields.publicProfile);

  await env.DB.prepare(
    `INSERT INTO show_characters (
       id,
       show_key,
       character_key,
       role,
       name,
       gender,
       avatar_object_key,
       personality,
       goal,
       boundaries,
       speaking_style,
       relationship_to_user,
       hidden_preferences,
       public_profile,
       owner_user_id,
       source,
       positive_signals,
       negative_signals,
       dealbreaker_signals,
       blow_up_signals,
       match_threshold,
       initial_affinity,
       status,
       sort_order
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      showKey,
      characterKey,
      "guest",
      fields.name,
      fields.gender,
      fields.avatarObjectKey,
      fields.personality,
      fields.goal,
      fields.boundaries,
      fields.speakingStyle,
      fields.relationshipToUser,
      fields.hiddenPreferences,
      JSON.stringify(publicProfile),
      user.id,
      "user",
      JSON.stringify(fields.positiveSignals),
      JSON.stringify(fields.negativeSignals),
      JSON.stringify(fields.dealbreakerSignals),
      JSON.stringify(fields.blowUpSignals),
      fields.matchThreshold,
      fields.initialAffinity,
      "active",
      1000,
    )
    .run();
}

async function getUserCharacterPackage(env: ShowEngineEnv, showKey: string, characterKey: string, user: UserRecord) {
  const character = await requireOwnedUserCharacter(env, showKey, characterKey, user);
  return serializeCharacterPackageResponse(character);
}

async function updateUserCharacterPackage(
  env: ShowEngineEnv,
  showKey: string,
  characterKey: string,
  body: CharacterPackageRequest,
) {
  const email = normalizeEmail(body.email);
  if (!email) {
    throw new Response("email_required", { status: 400 });
  }

  const user = await ensureUserByEmail(env, email);
  const current = await requireOwnedUserCharacter(env, showKey, characterKey, user);
  const validation = validateGuestCharacterPackage(body.characterPackage ?? body.package ?? body, guestPackageFromRow(current));
  if (validation.errors.length > 0) {
    throw jsonResponse({ error: "invalid_character_package", errors: validation.errors }, { status: 400 });
  }

  const fields = guestPackageToCharacterFields(validation.package);
  await updateUserCharacterFields(env, showKey, characterKey, user, fields);

  const updated = await requireOwnedUserCharacter(env, showKey, characterKey, user);
  return serializeCharacterPackageResponse(updated);
}

async function bindUserCharacterAsset(
  env: ShowEngineEnv,
  showKey: string,
  characterKey: string,
  body: CharacterAssetRequest,
) {
  const email = normalizeEmail(body.email);
  if (!email) {
    throw new Response("email_required", { status: 400 });
  }

  const objectKey = normalizeObjectKey(body.objectKey);
  if (!objectKey) {
    throw new Response("invalid_object_key", { status: 400 });
  }

  const user = await ensureUserByEmail(env, email);
  const current = await requireOwnedUserCharacter(env, showKey, characterKey, user);
  const nextPackage = bindGuestAsset(guestPackageFromRow(current), {
    objectKey,
    slot: body.slot,
    visualStateKey: body.visualStateKey,
  });
  await updateUserCharacterFields(env, showKey, characterKey, user, guestPackageToCharacterFields(nextPackage));

  const updated = await requireOwnedUserCharacter(env, showKey, characterKey, user);
  return serializeCharacterPackageResponse(updated);
}

async function publishUserCharacter(
  env: ShowEngineEnv,
  showKey: string,
  characterKey: string,
  body: PublishCharacterRequest,
) {
  const email = normalizeEmail(body.email);
  if (!email) {
    throw new Response("email_required", { status: 400 });
  }

  const user = await ensureUserByEmail(env, email);
  const current = await requireOwnedUserCharacter(env, showKey, characterKey, user);
  const characterPackage = guestPackageFromRow(current);
  const visibility = body.visibility === "private" ? "private" : "public";
  characterPackage.publicProfile = {
    ...characterPackage.publicProfile,
    publishedAt: visibility === "public" ? new Date().toISOString() : null,
    visibility,
  };

  await updateUserCharacterFields(env, showKey, characterKey, user, guestPackageToCharacterFields(characterPackage));

  const updated = await requireOwnedUserCharacter(env, showKey, characterKey, user);
  return serializeCharacterPackageResponse(updated);
}

async function updateUserCharacterFields(
  env: ShowEngineEnv,
  showKey: string,
  characterKey: string,
  user: UserRecord,
  fields: ReturnType<typeof guestPackageToCharacterFields>,
) {
  const publicProfile = withCharacterVisibility(fields.publicProfile);

  await env.DB.prepare(
    `UPDATE show_characters
     SET name = ?,
         gender = ?,
         avatar_object_key = ?,
         personality = ?,
         goal = ?,
         boundaries = ?,
         speaking_style = ?,
         relationship_to_user = ?,
         hidden_preferences = ?,
         public_profile = ?,
         positive_signals = ?,
         negative_signals = ?,
         dealbreaker_signals = ?,
         blow_up_signals = ?,
         hard_preference_signals = ?,
         soft_preference_signals = ?,
         match_threshold = ?,
         initial_affinity = ?
     WHERE show_key = ? AND character_key = ? AND owner_user_id = ? AND source = ?`,
  )
    .bind(
      fields.name,
      fields.gender,
      fields.avatarObjectKey,
      fields.personality,
      fields.goal,
      fields.boundaries,
      fields.speakingStyle,
      fields.relationshipToUser,
      fields.hiddenPreferences,
      JSON.stringify(publicProfile),
      JSON.stringify(fields.positiveSignals),
      JSON.stringify(fields.negativeSignals),
      JSON.stringify(fields.dealbreakerSignals),
      JSON.stringify(fields.blowUpSignals),
      JSON.stringify(fields.hardPreferenceSignals),
      JSON.stringify(fields.softPreferenceSignals),
      fields.matchThreshold,
      fields.initialAffinity,
      showKey,
      characterKey,
      user.id,
      "user",
    )
    .run();
}

async function requireOwnedUserCharacter(
  env: ShowEngineEnv,
  showKey: string,
  characterKey: string,
  user: UserRecord,
): Promise<ShowCharacterRow> {
  const character = await env.DB.prepare(
    `SELECT character_key, role, name, gender, avatar_object_key, personality, goal, boundaries,
            speaking_style, relationship_to_user, hidden_preferences, public_profile, owner_user_id,
            source, positive_signals, negative_signals, dealbreaker_signals, blow_up_signals,
            hard_preference_signals, soft_preference_signals, match_threshold, initial_affinity
     FROM show_characters
     WHERE show_key = ? AND character_key = ? AND status = ?
     LIMIT 1`,
  )
    .bind(showKey, characterKey, "active")
    .first<ShowCharacterRow>();

  if (!character) {
    throw new Response("character_not_found", { status: 404 });
  }

  if (character.source !== "user" || character.owner_user_id !== user.id) {
    throw new Response("character_forbidden", { status: 403 });
  }

  return character;
}

async function createSession(env: ShowEngineEnv, showKey: string, body: CreateSessionRequest) {
  const email = normalizeEmail(body.email);
  if (!email) {
    throw new Response("email_required", { status: 400 });
  }

  const show = await requireShow(env, showKey);
  const stages = await getStages(env, showKey);
  const firstStage = stages[0];
  if (!firstStage) {
    throw new Response("show_stages_missing", { status: 500 });
  }

  const user = await ensureUserByEmail(env, email);
  const audiencePreference = normalizeAudiencePreference(body.guestPreference);
  const sessionId = crypto.randomUUID();
  const avatarLabel = normalizeShortText(body.avatarLabel, "Spotlight Guest", 80);
  const avatarObjectKey = normalizeObjectKey(body.avatarObjectKey);
  const hardProfile = normalizeHardProfile(body, avatarObjectKey);
  await upsertUserShowProfile(env, show, user, hardProfile);
  const selectedGuestKeys = normalizeSelectedGuestKeys(body.selectedGuestKeys);
  const legacyRequestedKeys = new Set(body.userCharacterKeys ?? []);
  const characters = await getCharacters(
    env,
    showKey,
    selectedGuestKeys || legacyRequestedKeys.size > 0 ? "any" : audiencePreference,
    user,
  );
  const host = characters.find((character) => character.role === "host");
  const guests = selectedGuestKeys
    ? resolveSelectedSessionGuests(characters, selectedGuestKeys)
    : resolveLegacySessionGuests(characters, audiencePreference, legacyRequestedKeys);

  if (!host || guests.length === 0) {
    throw new Response("show_characters_missing", { status: 500 });
  }

  await env.DB.prepare(
    `INSERT INTO show_sessions (
       id, app_key, show_key, user_id, avatar_object_key, avatar_label, audience_preference,
       current_stage_key, status, user_profile, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
  )
    .bind(
      sessionId,
      show.app_key,
      show.show_key,
      user.id,
      avatarObjectKey,
      avatarLabel,
      audiencePreference,
      firstStage.stage_key,
      "active",
      JSON.stringify(serializeHardProfileForSession(hardProfile, [])),
    )
    .run();

  for (const character of [host, ...guests]) {
    await env.DB.prepare(
      `INSERT INTO show_session_characters (
         session_id, app_key, show_key, user_id, character_key, role, name, snapshot, affinity_score, is_available
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        sessionId,
        show.app_key,
        show.show_key,
        user.id,
        character.character_key,
        character.role,
        character.name,
        JSON.stringify(serializeCharacter(character)),
        character.role === "guest"
          ? clamp(
              character.initial_affinity +
                calculateHardPreferenceBoost({ hardPreferenceSignals: character.hard_preference_signals }, hardProfile),
              0,
              100,
            )
          : 100,
        1,
      )
      .run();
  }

  await insertMessage(env, {
    appKey: show.app_key,
    content: show.opening_scene,
    role: "host",
    sessionId,
    showKey: show.show_key,
    speakerKey: "host",
    speakerName: host.name,
    stageKey: firstStage.stage_key,
    userId: user.id,
  });

  await insertShowEvent(env, {
    appKey: show.app_key,
    content: show.opening_scene,
    eventType: "host_opening",
    sessionId,
    showKey: show.show_key,
    speakerKey: "host",
    speakerName: host.name,
    stageKey: firstStage.stage_key,
    userId: user.id,
  });
  await createTurnForStage(env, {
    show,
    session: {
      app_key: show.app_key,
      audience_preference: audiencePreference,
      avatar_label: avatarLabel,
      avatar_object_key: avatarObjectKey,
      current_stage_key: firstStage.stage_key,
      id: sessionId,
      initial_pick_character_key: null,
      match_success: 0,
      message_count: 0,
      points_awarded: 0,
      result_summary: null,
      selected_character_key: null,
      show_key: show.show_key,
      status: "active",
      updated_at: new Date().toISOString(),
      user_declaration: null,
      user_id: user.id,
      user_profile: JSON.stringify(serializeHardProfileForSession(hardProfile, [])),
    },
    stageKey: firstStage.stage_key,
    user,
  });

  return getSessionPayload(env, showKey, sessionId, user);
}

function resolveSelectedSessionGuests(characters: ShowCharacterRow[], selectedGuestKeys: string[]): ShowCharacterRow[] {
  const result = resolveSelectedGuestLineup(
    characters.map((character) => ({
      ...character,
      characterKey: character.character_key,
    })),
    selectedGuestKeys,
    5,
  );

  if (!result.ok) {
    throw new Response(result.error, { status: result.status });
  }

  return result.guests;
}

function resolveLegacySessionGuests(
  characters: ShowCharacterRow[],
  audiencePreference: AudiencePreference,
  requestedKeys: Set<string>,
): ShowCharacterRow[] {
  const officialGuests = characters.filter(
    (character) =>
      character.role === "guest" &&
      character.source === "official" &&
      (audiencePreference === "any" || character.gender === audiencePreference),
  );
  const userGuests = characters.filter(
    (character) =>
      character.role === "guest" &&
      character.source === "user" &&
      requestedKeys.has(character.character_key),
  );

  return [...userGuests, ...officialGuests].slice(0, 4);
}

async function addMessage(env: ShowEngineEnv, showKey: string, sessionId: string, body: MessageRequest) {
  const email = normalizeEmail(body.email);
  const content = normalizeShortText(body.message, "", 1200);
  if (!email) {
    throw new Response("email_required", { status: 400 });
  }

  if (!content) {
    throw new Response("message_required", { status: 400 });
  }

  const user = await ensureUserByEmail(env, email);
  const [show, session, stages] = await Promise.all([
    requireShow(env, showKey),
    requireSession(env, showKey, sessionId, user),
    getStages(env, showKey),
  ]);

  if (session.status === "completed") {
    throw new Response("session_completed", { status: 409 });
  }

  if (session.current_stage_key !== "guest_questions") {
    throw new Response("messages_only_available_in_guest_interaction", { status: 409 });
  }

  await insertMessage(env, {
    appKey: show.app_key,
    content,
    role: "user",
    sessionId,
    showKey: show.show_key,
    speakerKey: user.id,
    speakerName: "You",
    stageKey: session.current_stage_key,
    userId: user.id,
  });

  const characters = await getSessionCharacters(env, show, sessionId, user);
  const guests = characters.filter((character) => character.role === "guest");
  const host = characters.find((character) => character.role === "host");
  const nextCount = session.message_count + 1;
  const currentStage = findStage(stages, session.current_stage_key) ?? fallbackStage();
  const signals = extractSignals(content);
  await applySignalsToGuests(env, {
    multiplier: 1,
    session,
    sessionId,
    signals,
    user,
  });
  const updatedGuests = (await getSessionCharacters(env, show, sessionId, user)).filter(
    (character) => character.role === "guest",
  );
  const selectedGuest = chooseActiveGuest(updatedGuests) ?? guests[nextCount % guests.length] ?? guests[0];
  const nextAffinity = selectedGuest?.affinity_score ?? 50;

  const nextSession: ShowSessionRow = {
    ...session,
    message_count: nextCount,
  };

  if (selectedGuest) {
    const guestLine = await generateShowLine(env, {
      content,
      host,
      nextAffinity,
      role: "character",
      selectedCharacter: selectedGuest,
      session: nextSession,
      show,
      stage: currentStage,
    });

    await insertMessage(env, {
      appKey: show.app_key,
      content: guestLine,
      role: "character",
      sessionId,
      showKey: show.show_key,
      speakerKey: selectedGuest.character_key,
      speakerName: selectedGuest.name,
      stageKey: currentStage.stage_key,
      userId: user.id,
    });
  }

  await env.DB.prepare(
    `UPDATE show_sessions
     SET message_count = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  )
    .bind(nextCount, sessionId, user.id)
    .run();

  return getSessionPayload(env, showKey, sessionId, user);
}

async function previewSessionSpeech(
  env: ShowEngineEnv,
  showKey: string,
  sessionId: string,
  body: SpeechPreviewRequest,
) {
  const email = normalizeEmail(body.email);
  if (!email) {
    throw new Response("email_required", { status: 400 });
  }

  const user = await ensureUserByEmail(env, email);
  const [show] = await Promise.all([
    requireShow(env, showKey),
    requireSession(env, showKey, sessionId, user),
  ]);
  let speakerKey = normalizeShortText(body.speakerKey ?? undefined, "", 100) || null;
  let text = normalizeShortText(body.text, "", 1200);
  const messageId = normalizeShortText(body.messageId, "", 100);

  if (messageId) {
    const message = await env.DB.prepare(
      `SELECT speaker_key, content
       FROM show_messages
       WHERE id = ? AND app_key = ? AND show_key = ? AND session_id = ? AND user_id = ?
       LIMIT 1`,
    )
      .bind(messageId, show.app_key, show.show_key, sessionId, user.id)
      .first<{ content: string; speaker_key: string | null }>();

    if (!message) {
      throw new Response("message_not_found", { status: 404 });
    }

    speakerKey = message.speaker_key ?? speakerKey;
    text = message.content || text;
  }

  if (!text) {
    throw new Response("speech_text_required", { status: 400 });
  }

  return {
    audioUrl: null,
    speakerKey,
    status: "not_configured",
    text,
  };
}

async function answerTurn(
  env: ShowEngineEnv,
  showKey: string,
  sessionId: string,
  turnId: string,
  body: TurnAnswerRequest,
  streamOptions: TurnAnswerOptions = {},
) {
  const email = normalizeEmail(body.email);
  if (!email) {
    throw new Response("email_required", { status: 400 });
  }

  const selectedOptionId = normalizeShortText(body.selectedOptionId, "", 80);
  const selectedCharacterKey = normalizeShortText(body.selectedCharacterKey, "", 100);
  const freeText = normalizeShortText(body.freeText, "", 1200);
  const user = await ensureUserByEmail(env, email);
  const [show, session] = await Promise.all([
    requireShow(env, showKey),
    requireSession(env, showKey, sessionId, user),
  ]);

  if (session.status === "completed") {
    throw new Response("session_completed", { status: 409 });
  }

  const turn = await requireTurn(env, show, sessionId, turnId, user);
  if (turn.status !== "awaiting_user") {
    throw new Response("turn_already_answered", { status: 409 });
  }

  if (turn.stage_key !== session.current_stage_key) {
    throw new Response("turn_stage_mismatch", { status: 409 });
  }

  const options = readTurnOptions(turn.options);
  const selectedOption = options.find((option) => option.id === selectedOptionId) ?? null;
  const stagesWithoutRequiredAnswer = ["initial_pick", "self_intro", "user_questions"];
  if (!selectedOption && !freeText && !stagesWithoutRequiredAnswer.includes(turn.stage_key)) {
    throw new Response("answer_required", { status: 400 });
  }

  const guests = (await getSessionCharacters(env, show, sessionId, user)).filter(
    (character) => character.role === "guest",
  );
  const pickedGuest = selectedCharacterKey
    ? guests.find((guest) => guest.character_key === selectedCharacterKey)
    : null;

  if (turn.stage_key === "initial_pick" && !pickedGuest) {
    throw new Response("character_required", { status: 400 });
  }

  const answerText = composeTurnAnswer({
    freeText,
    pickedGuestName: pickedGuest?.name,
    selectedOption,
    stageKey: turn.stage_key,
  });
  if (!answerText) {
    throw new Response("answer_required", { status: 400 });
  }

  await env.DB.prepare(
    `UPDATE show_turns
     SET selected_option_id = ?, selected_character_key = ?, answer_text = ?,
         status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND session_id = ? AND user_id = ?`,
  )
    .bind(
      selectedOption?.id ?? null,
      pickedGuest?.character_key ?? null,
      answerText,
      "answered",
      turn.id,
      sessionId,
      user.id,
    )
    .run();

  await insertMessage(env, {
    appKey: show.app_key,
    content: answerText,
    role: "user",
    sessionId,
    showKey: show.show_key,
    speakerKey: user.id,
    speakerName: "You",
    stageKey: turn.stage_key,
    userId: user.id,
  });
  await insertShowEvent(env, {
    appKey: show.app_key,
    content: answerText,
    eventType: "user_answer",
    sessionId,
    showKey: show.show_key,
    speakerKey: user.id,
    speakerName: "You",
    stageKey: turn.stage_key,
    turnId: turn.id,
    userId: user.id,
  });

  const signalText = `${answerText} ${selectedOption?.signalText ?? ""}`;
  const turnSignals = extractSignals(signalText);
  await mergeDerivedProfileTags(env, {
    session,
    show,
    signals: turnSignals,
    user,
  });
  const semanticJudgment = await judgeTurnSemantics(env, {
    answerText: signalText,
    pickedGuestKey: pickedGuest?.character_key ?? null,
    selectedOption,
    session,
    sessionId,
    show,
    turn,
    user,
  });
  if (turn.stage_key === "initial_pick") {
    return handleInitialPickTurnAnswer(env, {
      answerText: signalText,
      pickedGuest: pickedGuest!,
      semanticJudgment,
      session,
      sessionId,
      show,
      stream: streamOptions,
      turn,
      user,
    });
  }

  if (turn.stage_key === "self_intro") {
    return handleSelfIntroTurnAnswer(env, {
      answerText: signalText,
      freeText,
      session,
      sessionId,
      show,
      stream: streamOptions,
      turn,
      user,
    });
  }

  if (turn.stage_key === "guest_questions") {
    return handleGuestQuestionTurnAnswer(env, {
      answerText: signalText,
      selectedOptionId: selectedOption?.id ?? null,
      semanticJudgment,
      session,
      sessionId,
      show,
      stream: streamOptions,
      turn,
      user,
    });
  }

  if (turn.stage_key === "user_questions") {
    return handleUserQuestionTurnAnswer(env, {
      answerText: signalText,
      freeText,
      selectedCharacterKey: pickedGuest?.character_key ?? selectedCharacterKey,
      selectedOptionId: selectedOption?.id ?? null,
      session,
      sessionId,
      show,
      stream: streamOptions,
      turn,
      user,
    });
  }

  throw new Response("unsupported_turn_stage", { status: 409 });
}

async function handleInitialPickTurnAnswer(
  env: ShowEngineEnv,
  input: {
    answerText: string;
    pickedGuest: SessionCharacterRow;
    semanticJudgment: SemanticTurnJudgment;
    session: ShowSessionRow;
    sessionId: string;
    show: ShowTemplateRow;
    stream?: TurnAnswerOptions;
    turn: ShowTurnRow;
    user: UserRecord;
  },
) {
  const nextStage = "self_intro";
  const outcomes = await applySemanticJudgmentToGuests(env, {
    judgment: input.semanticJudgment,
    multiplier: 0.7,
    session: input.session,
    sessionId: input.sessionId,
    user: input.user,
  });
  await insertSemanticJudgmentEvent(env, {
    judgment: input.semanticJudgment,
    outcomes,
    sessionId: input.sessionId,
    show: input.show,
    stageKey: input.turn.stage_key,
    turnId: input.turn.id,
    user: input.user,
  });
  const heartbeatText = `${input.pickedGuest.name} catches the first heartbeat. The rest of the room is watching how specific your reason feels.`;
  await emitTextDelta(input.stream, heartbeatText, {
    speakerKey: input.pickedGuest.character_key,
    speakerName: input.pickedGuest.name,
  });
  await insertShowEvent(env, {
    appKey: input.show.app_key,
    content: heartbeatText,
    eventType: "guest_heart",
    sessionId: input.sessionId,
    showKey: input.show.show_key,
    speakerKey: input.pickedGuest.character_key,
    speakerName: input.pickedGuest.name,
    stageKey: input.turn.stage_key,
    turnId: input.turn.id,
    userId: input.user.id,
  });
  await emitReactionEvents(env, {
    outcomes,
    sessionId: input.sessionId,
    show: input.show,
    stageKey: input.turn.stage_key,
    turnId: input.turn.id,
    user: input.user,
  });
  await emitGeneratedReactions(env, {
    answerText: input.answerText,
    currentSpeakerKey: input.turn.speaker_key,
    focusCharacterKey: input.pickedGuest.character_key,
    judgment: input.semanticJudgment,
    outcomes,
    session: input.session,
    sessionId: input.sessionId,
    show: input.show,
    stageKey: input.turn.stage_key,
    stream: input.stream,
    turnId: input.turn.id,
    user: input.user,
  });
  await env.DB.prepare(
    `UPDATE show_sessions
     SET initial_pick_character_key = ?, current_stage_key = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  )
    .bind(input.pickedGuest.character_key, nextStage, input.sessionId, input.user.id)
    .run();

  const nextSession = await requireSession(env, input.show.show_key, input.sessionId, input.user);
  await insertHostSummary(env, {
    content: "First heartbeat locked. Before the guests start asking, the host needs to know a little about you.",
    session: nextSession,
    show: input.show,
    stageKey: nextStage,
    stream: input.stream,
    user: input.user,
  });
  await createTurnForStage(env, {
    show: input.show,
    session: nextSession,
    stageKey: nextStage,
    stream: input.stream,
    user: input.user,
  });

  return getSessionPayload(env, input.show.show_key, input.sessionId, input.user);
}

async function handleSelfIntroTurnAnswer(
  env: ShowEngineEnv,
  input: {
    answerText: string;
    freeText: string;
    session: ShowSessionRow;
    sessionId: string;
    show: ShowTemplateRow;
    stream?: TurnAnswerOptions;
    turn: ShowTurnRow;
    user: UserRecord;
  },
) {
  // Parse profile fields from the body (forwarded via answerText/freeText)
  // The frontend sends a JSON string in freeText containing { ageRange, occupation, hobbies }
  let profileUpdate: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(input.freeText);
    if (parsed && typeof parsed === "object") {
      profileUpdate = parsed as Record<string, unknown>;
    }
  } catch {
    // freeText is plain text — treat it as a plain intro
    profileUpdate = { intro: input.freeText };
  }

  const existingProfile = readJsonObject(input.session.user_profile);
  const merged = { ...existingProfile, ...profileUpdate };
  const signals = extractSignals(
    [profileUpdate.ageRange, profileUpdate.occupation, profileUpdate.hobbies].filter(Boolean).join(" "),
  );
  await applySignalsToGuests(env, { multiplier: 0.8, session: input.session, sessionId: input.sessionId, signals, user: input.user });
  await upsertUserShowProfile(env, input.show, input.user, {
    ageRange: typeof profileUpdate.ageRange === "string" ? profileUpdate.ageRange : "",
    avatarObjectKey: input.session.avatar_object_key,
    hobbies: typeof profileUpdate.hobbies === "string" ? splitUserList(profileUpdate.hobbies) : [],
    occupation: typeof profileUpdate.occupation === "string" ? profileUpdate.occupation : "",
  });

  const nextStage = "guest_questions";
  await env.DB.prepare(
    `UPDATE show_sessions
     SET user_profile = ?, current_stage_key = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  )
    .bind(JSON.stringify(merged), nextStage, input.sessionId, input.user.id)
    .run();

  const nextSession = await requireSession(env, input.show.show_key, input.sessionId, input.user);
  await insertHostSummary(env, {
    content: `Got it. The guests have been listening. Now they get to ask you one question each — and they know a little more than before.`,
    session: nextSession,
    show: input.show,
    stageKey: nextStage,
    stream: input.stream,
    user: input.user,
  });
  await createTurnForStage(env, {
    session: nextSession,
    show: input.show,
    stageKey: nextStage,
    stream: input.stream,
    user: input.user,
  });

  return getSessionPayload(env, input.show.show_key, input.sessionId, input.user);
}

async function handleGuestQuestionTurnAnswer(
  env: ShowEngineEnv,
  input: {
    answerText: string;
    selectedOptionId: string | null;
    semanticJudgment: SemanticTurnJudgment;
    session: ShowSessionRow;
    sessionId: string;
    show: ShowTemplateRow;
    stream?: TurnAnswerOptions;
    turn: ShowTurnRow;
    user: UserRecord;
  },
) {
  // User chose to move to user_questions stage
  if (input.selectedOptionId === "move_on") {
    await env.DB.prepare(
      `UPDATE show_sessions
       SET current_stage_key = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
    )
      .bind("user_questions", input.sessionId, input.user.id)
      .run();

    const nextSession = await requireSession(env, input.show.show_key, input.sessionId, input.user);
    await insertHostSummary(env, {
      content: "Now the room flips. You get to ask the guests anything you want before the final call.",
      session: nextSession,
      show: input.show,
      stageKey: "user_questions",
      stream: input.stream,
      user: input.user,
    });
    await createTurnForStage(env, {
      session: nextSession,
      show: input.show,
      stageKey: "user_questions",
      stream: input.stream,
      user: input.user,
    });

    return getSessionPayload(env, input.show.show_key, input.sessionId, input.user);
  }

  // Regular answer — apply affinity changes, emit reactions, stay in guest_questions
  const outcomes = await applySemanticJudgmentToGuests(env, {
    judgment: input.semanticJudgment,
    multiplier: 1,
    session: input.session,
    sessionId: input.sessionId,
    user: input.user,
  });
  await insertSemanticJudgmentEvent(env, {
    judgment: input.semanticJudgment,
    outcomes,
    sessionId: input.sessionId,
    show: input.show,
    stageKey: input.turn.stage_key,
    turnId: input.turn.id,
    user: input.user,
  });
  await emitReactionEvents(env, {
    outcomes,
    sessionId: input.sessionId,
    show: input.show,
    stageKey: input.turn.stage_key,
    turnId: input.turn.id,
    user: input.user,
  });
  await emitGeneratedReactions(env, {
    answerText: input.answerText,
    currentSpeakerKey: input.turn.speaker_key,
    focusCharacterKey: input.turn.speaker_key,
    judgment: input.semanticJudgment,
    outcomes,
    session: input.session,
    sessionId: input.sessionId,
    show: input.show,
    stageKey: input.turn.stage_key,
    stream: input.stream,
    turnId: input.turn.id,
    user: input.user,
  });

  if (await completeIfNoLights(env, input.show, input.sessionId, input.user)) {
    return getSessionPayload(env, input.show.show_key, input.sessionId, input.user);
  }

  const nextCount = input.session.message_count + 1;
  await env.DB.prepare(
    `UPDATE show_sessions
     SET message_count = ?, current_stage_key = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  )
    .bind(nextCount, "guest_questions", input.sessionId, input.user.id)
    .run();

  const nextSession = await requireSession(env, input.show.show_key, input.sessionId, input.user);
  await insertHostSummary(env, {
    content: "The room reacts. Another guest steps forward.",
    session: nextSession,
    show: input.show,
    stageKey: "guest_questions",
    stream: input.stream,
    user: input.user,
  });
  await createTurnForStage(env, {
    session: nextSession,
    show: input.show,
    stageKey: "guest_questions",
    stream: input.stream,
    user: input.user,
  });

  return getSessionPayload(env, input.show.show_key, input.sessionId, input.user);
}

async function handleUserQuestionTurnAnswer(
  env: ShowEngineEnv,
  input: {
    answerText: string;
    freeText: string;
    selectedCharacterKey: string | undefined;
    selectedOptionId: string | null;
    session: ShowSessionRow;
    sessionId: string;
    show: ShowTemplateRow;
    stream?: TurnAnswerOptions;
    turn: ShowTurnRow;
    user: UserRecord;
  },
) {
  // User is ready to make the final choice
  if (input.selectedOptionId === "move_to_final") {
    await env.DB.prepare(
      `UPDATE show_sessions
       SET current_stage_key = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
    )
      .bind("final_choice", input.sessionId, input.user.id)
      .run();

    const nextSession = await requireSession(env, input.show.show_key, input.sessionId, input.user);
    const roomSummary = await visibleRoomSummary(env, input.show, input.sessionId, input.user);
    await insertHostSummary(env, {
      content: `This is it. ${roomSummary} Choose one guest to walk off this stage with, or leave alone. The light does not lie.`,
      session: nextSession,
      show: input.show,
      stageKey: "final_choice",
      stream: input.stream,
      user: input.user,
    });

    return getSessionPayload(env, input.show.show_key, input.sessionId, input.user);
  }

  // User is asking a guest a question
  const question = input.freeText;
  if (!question) {
    throw new Response("answer_required", { status: 400 });
  }

  const characters = await getSessionCharacters(env, input.show, input.sessionId, input.user);
  const targetKey = input.selectedCharacterKey;
  const targetGuest = targetKey
    ? characters.find((c) => c.character_key === targetKey && c.role === "guest" && c.is_available === 1)
    : characters.filter((c) => c.role === "guest" && c.is_available === 1)[0];

  if (!targetGuest) {
    throw new Response("character_not_found", { status: 404 });
  }

  await insertMessage(env, {
    appKey: input.show.app_key,
    content: question,
    role: "user",
    sessionId: input.sessionId,
    showKey: input.show.show_key,
    speakerKey: input.user.id,
    speakerName: "You",
    stageKey: input.turn.stage_key,
    userId: input.user.id,
  });

  // Generate and stream the guest's answer
  const guestAnswer = await generateGuestAnswer(env, {
    guest: targetGuest,
    session: input.session,
    show: input.show,
    stageKey: input.turn.stage_key,
    stream: input.stream,
    userQuestion: question,
  });

  await insertMessage(env, {
    appKey: input.show.app_key,
    content: guestAnswer,
    role: "character",
    sessionId: input.sessionId,
    showKey: input.show.show_key,
    speakerKey: targetGuest.character_key,
    speakerName: targetGuest.name,
    stageKey: input.turn.stage_key,
    userId: input.user.id,
  });

  await env.DB.prepare(
    `UPDATE show_sessions
     SET message_count = message_count + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  )
    .bind(input.sessionId, input.user.id)
    .run();

  const nextSession = await requireSession(env, input.show.show_key, input.sessionId, input.user);
  await createTurnForStage(env, {
    session: nextSession,
    show: input.show,
    stageKey: "user_questions",
    stream: input.stream,
    user: input.user,
  });

  return getSessionPayload(env, input.show.show_key, input.sessionId, input.user);
}

async function advanceStage(
  env: ShowEngineEnv,
  showKey: string,
  sessionId: string,
  body: AdvanceStageRequest,
) {
  const email = normalizeEmail(body.email);
  if (!email) {
    throw new Response("email_required", { status: 400 });
  }

  const user = await ensureUserByEmail(env, email);
  const [show, session, stages] = await Promise.all([
    requireShow(env, showKey),
    requireSession(env, showKey, sessionId, user),
    getStages(env, showKey),
  ]);

  if (session.status === "completed") {
    throw new Response("session_completed", { status: 409 });
  }

  const targetStage = normalizeShortText(body.targetStage, "user_declaration", 80);
  if (session.current_stage_key !== "guest_questions" || targetStage !== "user_declaration") {
    throw new Response("invalid_stage_advance", { status: 409 });
  }

  const nextStage = findStage(stages, "user_declaration") ?? fallbackStage();
  await env.DB.prepare(
    `UPDATE show_sessions
     SET current_stage_key = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  )
    .bind(nextStage.stage_key, sessionId, user.id)
    .run();

  const roomSummary = await visibleRoomSummary(env, show, sessionId, user);
  await insertMessage(env, {
    appKey: show.app_key,
    content: `The room is ready for your declaration. ${roomSummary}`,
    role: "host",
    sessionId,
    showKey: show.show_key,
    speakerKey: "host",
    speakerName: "Host",
    stageKey: nextStage.stage_key,
    userId: user.id,
  });

  return getSessionPayload(env, showKey, sessionId, user);
}

async function submitInitialPick(
  env: ShowEngineEnv,
  showKey: string,
  sessionId: string,
  body: InitialPickRequest,
) {
  const email = normalizeEmail(body.email);
  if (!email) {
    throw new Response("email_required", { status: 400 });
  }

  const characterKey = normalizeShortText(body.characterKey, "", 100);
  if (!characterKey) {
    throw new Response("character_required", { status: 400 });
  }

  const user = await ensureUserByEmail(env, email);
  const [show, session, stages] = await Promise.all([
    requireShow(env, showKey),
    requireSession(env, showKey, sessionId, user),
    getStages(env, showKey),
  ]);
  const characters = await getSessionCharacters(env, show, sessionId, user);
  const picked = characters.find((character) => character.character_key === characterKey && character.role === "guest");
  if (!picked) {
    throw new Response("character_not_found", { status: 404 });
  }

  const nextStage = findStage(stages, "self_intro") ?? fallbackStage();
  await env.DB.prepare(
    `UPDATE show_sessions
     SET initial_pick_character_key = ?, current_stage_key = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  )
    .bind(characterKey, nextStage.stage_key, sessionId, user.id)
    .run();

  await insertMessage(env, {
    appKey: show.app_key,
    content: `Your first heartbeat is locked on ${picked.name}. Before the guests start, tell the room a little about yourself.`,
    role: "host",
    sessionId,
    showKey: show.show_key,
    speakerKey: "host",
    speakerName: "Host",
    stageKey: nextStage.stage_key,
    userId: user.id,
  });

  return getSessionPayload(env, showKey, sessionId, user);
}

async function submitProfileJudgment(
  env: ShowEngineEnv,
  showKey: string,
  sessionId: string,
  body: ProfileJudgmentRequest,
) {
  const email = normalizeEmail(body.email);
  if (!email) {
    throw new Response("email_required", { status: 400 });
  }

  const user = await ensureUserByEmail(env, email);
  const [show, session, stages] = await Promise.all([
    requireShow(env, showKey),
    requireSession(env, showKey, sessionId, user),
    getStages(env, showKey),
  ]);
  const userProfile = {
    ageRange: normalizeShortText(body.ageRange, "", 60),
    favoritePartnerType: normalizeShortText(body.favoritePartnerType, "", 240),
    hobbies: normalizeShortText(body.hobbies, "", 240),
    lifestyleNotes: normalizeShortText(body.lifestyleNotes, "", 240),
    occupation: normalizeShortText(body.occupation, "", 120),
    relationshipValues: normalizeShortText(body.relationshipValues, "", 240),
  };
  const signals = extractSignals(Object.values(userProfile).join(" "));
  await applySignalsToGuests(env, {
    multiplier: 1,
    session,
    sessionId,
    signals,
    user,
  });
  const nextStage = findStage(stages, "guest_questions") ?? fallbackStage();
  await env.DB.prepare(
    `UPDATE show_sessions
     SET user_profile = ?, current_stage_key = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  )
    .bind(JSON.stringify(userProfile), nextStage.stage_key, sessionId, user.id)
    .run();

  const roomSummary = await visibleRoomSummary(env, show, sessionId, user);
  await insertMessage(env, {
    appKey: show.app_key,
    content: `Profile judgment is in. ${roomSummary}`,
    role: "host",
    sessionId,
    showKey: show.show_key,
    speakerKey: "host",
    speakerName: "Host",
    stageKey: nextStage.stage_key,
    userId: user.id,
  });

  return getSessionPayload(env, showKey, sessionId, user);
}

async function submitUserDeclaration(
  env: ShowEngineEnv,
  showKey: string,
  sessionId: string,
  body: UserDeclarationRequest,
) {
  const email = normalizeEmail(body.email);
  const declaration = normalizeShortText(body.declaration, "", 1200);
  if (!email) {
    throw new Response("email_required", { status: 400 });
  }

  if (!declaration) {
    throw new Response("declaration_required", { status: 400 });
  }

  const user = await ensureUserByEmail(env, email);
  const [show, session, stages] = await Promise.all([
    requireShow(env, showKey),
    requireSession(env, showKey, sessionId, user),
    getStages(env, showKey),
  ]);
  const signals = extractSignals(declaration);
  await applySignalsToGuests(env, {
    multiplier: 1.4,
    session,
    sessionId,
    signals,
    user,
  });
  const nextStage = findStage(stages, "final_choice") ?? fallbackStage();
  await env.DB.prepare(
    `UPDATE show_sessions
     SET user_declaration = ?, current_stage_key = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  )
    .bind(declaration, nextStage.stage_key, sessionId, user.id)
    .run();

  const roomSummary = await visibleRoomSummary(env, show, sessionId, user);
  await insertMessage(env, {
    appKey: show.app_key,
    content: `Your declaration shifts the room. ${roomSummary} Now the final choice belongs to you.`,
    role: "host",
    sessionId,
    showKey: show.show_key,
    speakerKey: "host",
    speakerName: "Host",
    stageKey: nextStage.stage_key,
    userId: user.id,
  });

  return getSessionPayload(env, showKey, sessionId, user);
}

async function finalizeSession(env: ShowEngineEnv, showKey: string, sessionId: string, body: FinalChoiceRequest) {
  const email = normalizeEmail(body.email);
  if (!email) {
    throw new Response("email_required", { status: 400 });
  }

  const user = await ensureUserByEmail(env, email);
  const [show, session] = await Promise.all([
    requireShow(env, showKey),
    requireSession(env, showKey, sessionId, user),
  ]);
  const characters = await getSessionCharacters(env, show, sessionId, user);
  const guests = characters.filter((character) => character.role === "guest");
  const selectedKey = body.characterKey ?? body.guestTemplateId;
  const selectedCharacter =
    selectedKey && selectedKey !== "none"
      ? guests.find((character) => character.character_key === selectedKey)
      : null;
  const selectedSnapshot = selectedCharacter ? (parseSnapshot(selectedCharacter.snapshot) as CharacterSnapshot) : null;
  const matchThreshold =
    typeof selectedSnapshot?.matchThreshold === "number" ? selectedSnapshot.matchThreshold : 75;
  const matchSuccess =
    !!selectedCharacter &&
    selectedCharacter.is_available === 1 &&
    selectedCharacter.light_state !== "off" &&
    selectedCharacter.dealbreaker_triggered !== 1 &&
    (selectedCharacter.light_state === "blow_up" || selectedCharacter.affinity_score >= matchThreshold);
  const pointsAwarded = matchSuccess ? 100 : 0;
  const summary = selectedCharacter
    ? matchSuccess
      ? `${selectedCharacter.name} steps into the final spotlight with you. The host calls it a mutual match, and ${selectedCharacter.name} is now unlocked for solo date stories in your Workspace.`
      : `${selectedCharacter.name} stays thoughtful under the lights. The choice is sincere, but the hidden signal is not strong enough for a successful hand-in-hand finale.`
    : "You leave the stage solo tonight. The host frames it as a brave choice: no forced match, no fake spark, just a clean ending.";

  if (session.status !== "completed") {
    await env.DB.prepare(
      `UPDATE show_sessions
       SET current_stage_key = ?, status = ?, selected_character_key = ?, result_summary = ?,
           match_success = ?, points_awarded = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
    )
      .bind(
        "completed",
        "completed",
        selectedCharacter?.character_key ?? null,
        summary,
        matchSuccess ? 1 : 0,
        pointsAwarded,
        sessionId,
        user.id,
      )
      .run();

    if (matchSuccess) {
      await unlockCompanion(env, {
        selectedCharacter,
        session,
        show,
        user,
      });
      await env.DB.prepare(
        `INSERT INTO platform_point_events (
           id, app_key, show_key, session_id, user_id, event_type, points, metadata
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          show.app_key,
          show.show_key,
          sessionId,
          user.id,
          "dating_match_success",
          pointsAwarded,
          JSON.stringify({ selectedCharacterKey: selectedCharacter.character_key }),
        )
        .run();
    }

    await insertMessage(env, {
      appKey: show.app_key,
      content: summary,
      role: "host",
      sessionId,
      showKey: show.show_key,
      speakerKey: "host",
      speakerName: characters.find((character) => character.role === "host")?.name ?? "Host",
      stageKey: "completed",
      userId: user.id,
    });
  }

  return getSessionPayload(env, showKey, sessionId, user);
}

async function getSessionPayload(env: ShowEngineEnv, showKey: string, sessionId: string, user: UserRecord) {
  const [show, session] = await Promise.all([
    requireShow(env, showKey),
    requireSession(env, showKey, sessionId, user),
  ]);
  const [characters, messages, entitlement, stages] = await Promise.all([
    getSessionCharacters(env, show, sessionId, user),
    getMessages(env, show, sessionId, user),
    getEntitlement(env, user, show),
    getStages(env, showKey),
  ]);
  const [currentTurn, eventLog] = await Promise.all([
    getCurrentTurn(env, show, sessionId, user),
    getEventLog(env, show, sessionId, user),
  ]);
  const profile = await getUserShowProfile(env, show, user);
  const guests = characters.filter((character) => character.role === "guest");
  const serializedEventLog = eventLog.map(serializeEvent);

  return {
    characters: characters.map(serializeSessionCharacter),
    currentTurn: currentTurn ? serializeTurn(currentTurn) : null,
    entitlement,
    eventLog: serializedEventLog,
    generatedReactions: serializeGeneratedReactions(serializedEventLog),
    guestStates: serializeGuestStates(guests, serializedEventLog),
    guests: guests.map(serializeSessionGuest),
    messages: messages.map(serializeMessage),
    profile: profile ? serializeUserShowProfile(profile) : readJsonObject(session.user_profile),
    session: serializeSession(session),
    show: serializeShow(show),
    stages: stages.map(serializeStage),
  };
}

async function requireShow(env: ShowEngineEnv, showKey: string): Promise<ShowTemplateRow> {
  const show = await env.DB.prepare(
    `SELECT show_key, app_key, title, subtitle, show_type, premise, background_image_key,
            opening_scene, ending_rules, default_avatar_options, config
     FROM show_templates
     WHERE show_key = ? AND status = ?
     LIMIT 1`,
  )
    .bind(showKey, "active")
    .first<ShowTemplateRow>();

  if (!show) {
    throw new Response("show_not_found", { status: 404 });
  }

  return show;
}

async function getCharacters(
  env: ShowEngineEnv,
  showKey: string,
  audiencePreference: AudiencePreference,
  user: UserRecord | null,
): Promise<ShowCharacterRow[]> {
  const query =
    audiencePreference === "any"
      ? `SELECT character_key, role, name, gender, avatar_object_key, personality, goal, boundaries,
                speaking_style, relationship_to_user, hidden_preferences, public_profile, owner_user_id,
                source, positive_signals, negative_signals, dealbreaker_signals, blow_up_signals,
                hard_preference_signals, soft_preference_signals, match_threshold, initial_affinity
         FROM show_characters
         WHERE show_key = ? AND status = ?
         ORDER BY sort_order ASC`
      : `SELECT character_key, role, name, gender, avatar_object_key, personality, goal, boundaries,
                speaking_style, relationship_to_user, hidden_preferences, public_profile, owner_user_id,
                source, positive_signals, negative_signals, dealbreaker_signals, blow_up_signals,
                hard_preference_signals, soft_preference_signals, match_threshold, initial_affinity
         FROM show_characters
         WHERE show_key = ? AND status = ? AND (role != ? OR gender = ?)
         ORDER BY sort_order ASC`;
  const prepared = env.DB.prepare(query);
  const result =
    audiencePreference === "any"
      ? await prepared.bind(showKey, "active").all<ShowCharacterRow>()
      : await prepared.bind(showKey, "active", "guest", audiencePreference).all<ShowCharacterRow>();

  return result.results.filter((character) => canReadCharacter(character, user));
}

async function getStages(env: ShowEngineEnv, showKey: string): Promise<ShowStageRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT stage_key, title, stage_order, goal, host_instruction, allowed_user_actions,
            auto_advance_after_messages, is_final
     FROM show_stages
     WHERE show_key = ?
     ORDER BY stage_order ASC`,
  )
    .bind(showKey)
    .all<ShowStageRow>();

  return results;
}

async function requireSession(
  env: ShowEngineEnv,
  showKey: string,
  sessionId: string,
  user: UserRecord,
): Promise<ShowSessionRow> {
  const session = await env.DB.prepare(
    `SELECT id, app_key, show_key, user_id, avatar_object_key, avatar_label, audience_preference,
            current_stage_key, status, initial_pick_character_key, user_profile, user_declaration,
            selected_character_key, result_summary, match_success, points_awarded, message_count, updated_at
     FROM show_sessions
     WHERE id = ? AND show_key = ? AND user_id = ?
     LIMIT 1`,
  )
    .bind(sessionId, showKey, user.id)
    .first<ShowSessionRow>();

  if (!session) {
    throw new Response("session_not_found", { status: 404 });
  }

  return session;
}

async function getSessionCharacters(
  env: ShowEngineEnv,
  show: ShowTemplateRow,
  sessionId: string,
  user: UserRecord,
): Promise<SessionCharacterRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT character_key, role, name, snapshot, affinity_score, is_available,
            light_state, dealbreaker_triggered, strong_signal_count
     FROM show_session_characters
     WHERE session_id = ? AND app_key = ? AND show_key = ? AND user_id = ?
     ORDER BY rowid ASC`,
  )
    .bind(sessionId, show.app_key, show.show_key, user.id)
    .all<SessionCharacterRow>();

  return results;
}

async function getMessages(
  env: ShowEngineEnv,
  show: ShowTemplateRow,
  sessionId: string,
  user: UserRecord,
): Promise<ShowMessageRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, role, speaker_key, speaker_name, content, stage_key, created_at
     FROM show_messages
     WHERE session_id = ? AND app_key = ? AND show_key = ? AND user_id = ?
     ORDER BY created_at ASC`,
  )
    .bind(sessionId, show.app_key, show.show_key, user.id)
    .all<ShowMessageRow>();

  return results;
}

async function getRecentMessages(
  env: ShowEngineEnv,
  show: ShowTemplateRow,
  sessionId: string,
  user: UserRecord,
  limit: number,
): Promise<ShowMessageRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, role, speaker_key, speaker_name, content, stage_key, created_at
     FROM show_messages
     WHERE session_id = ? AND app_key = ? AND show_key = ? AND user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
  )
    .bind(sessionId, show.app_key, show.show_key, user.id, limit)
    .all<ShowMessageRow>();

  return results.reverse();
}

async function requireTurn(
  env: ShowEngineEnv,
  show: ShowTemplateRow,
  sessionId: string,
  turnId: string,
  user: UserRecord,
): Promise<ShowTurnRow> {
  const turn = await env.DB.prepare(
    `SELECT id, stage_key, turn_index, speaker_key, speaker_name, question, options,
            selected_option_id, selected_character_key, answer_text, status, created_at, updated_at
     FROM show_turns
     WHERE id = ? AND session_id = ? AND app_key = ? AND show_key = ? AND user_id = ?
     LIMIT 1`,
  )
    .bind(turnId, sessionId, show.app_key, show.show_key, user.id)
    .first<ShowTurnRow>();

  if (!turn) {
    throw new Response("turn_not_found", { status: 404 });
  }

  return turn;
}

async function getCurrentTurn(
  env: ShowEngineEnv,
  show: ShowTemplateRow,
  sessionId: string,
  user: UserRecord,
): Promise<ShowTurnRow | null> {
  return env.DB.prepare(
    `SELECT id, stage_key, turn_index, speaker_key, speaker_name, question, options,
            selected_option_id, selected_character_key, answer_text, status, created_at, updated_at
     FROM show_turns
     WHERE session_id = ? AND app_key = ? AND show_key = ? AND user_id = ? AND status = ?
     ORDER BY turn_index DESC, created_at DESC
     LIMIT 1`,
  )
    .bind(sessionId, show.app_key, show.show_key, user.id, "awaiting_user")
    .first<ShowTurnRow>();
}

async function getEventLog(
  env: ShowEngineEnv,
  show: ShowTemplateRow,
  sessionId: string,
  user: UserRecord,
): Promise<ShowEventRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, turn_id, event_order, event_type, speaker_key, speaker_name, content,
            stage_key, data, created_at
     FROM show_events
     WHERE session_id = ? AND app_key = ? AND show_key = ? AND user_id = ?
     ORDER BY event_order ASC, created_at ASC
     LIMIT 80`,
  )
    .bind(sessionId, show.app_key, show.show_key, user.id)
    .all<ShowEventRow>();

  return results;
}

async function createTurnForStage(
  env: ShowEngineEnv,
  input: {
    session: ShowSessionRow;
    show: ShowTemplateRow;
    stageKey: string;
    stream?: TurnAnswerOptions;
    user: UserRecord;
  },
): Promise<ShowTurnRow | null> {
  const existing = await getCurrentTurn(env, input.show, input.session.id, input.user);
  if (existing && existing.stage_key === input.stageKey) {
    return existing;
  }

  const characters = await getSessionCharacters(env, input.show, input.session.id, input.user);
  const guests = characters.filter((character) => character.role === "guest");
  const host = characters.find((character) => character.role === "host");
  const draft = buildTurnDraft({
    guests,
    host,
    session: input.session,
    stageKey: input.stageKey,
  });
  if (!draft) {
    return null;
  }

  // For guest_questions, replace the placeholder question with an LLM-generated one
  if (input.stageKey === "guest_questions") {
    const speakerGuest = characters.find((c) => c.character_key === draft.speakerKey);
    if (speakerGuest) {
      const recentMessages = await getRecentMessages(env, input.show, input.session.id, input.user, 6);
      draft.question = await generateGuestQuestion(env, {
        guest: speakerGuest,
        recentMessages,
        session: input.session,
        show: input.show,
        stageKey: input.stageKey,
        stream: input.stream,
      });
    }
  }

  const nextIndex = await getNextTurnIndex(env, input.show, input.session.id, input.user);
  const turnId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO show_turns (
       id, session_id, app_key, show_key, user_id, stage_key, turn_index,
       speaker_key, speaker_name, question, options
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      turnId,
      input.session.id,
      input.show.app_key,
      input.show.show_key,
      input.user.id,
      draft.stageKey,
      nextIndex,
      draft.speakerKey,
      draft.speakerName,
      draft.question,
      JSON.stringify(draft.options),
    )
    .run();

  // Only emit the question if we didn't already stream it (LLM streams inline for guest_questions)
  if (input.stageKey !== "guest_questions") {
    await emitTextDelta(input.stream, draft.question, {
      speakerKey: draft.speakerKey,
      speakerName: draft.speakerName,
    });
  }
  await insertShowEvent(env, {
    appKey: input.show.app_key,
    content: draft.question,
    eventType: draft.stageKey === "guest_questions" ? "guest_question" : "host_summary",
    sessionId: input.session.id,
    showKey: input.show.show_key,
    speakerKey: draft.speakerKey,
    speakerName: draft.speakerName,
    stageKey: draft.stageKey,
    turnId,
    userId: input.user.id,
  });

  return requireTurn(env, input.show, input.session.id, turnId, input.user);
}

async function getNextTurnIndex(
  env: ShowEngineEnv,
  show: ShowTemplateRow,
  sessionId: string,
  user: UserRecord,
): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(MAX(turn_index), 0) + 1 AS nextIndex
     FROM show_turns
     WHERE session_id = ? AND app_key = ? AND show_key = ? AND user_id = ?`,
  )
    .bind(sessionId, show.app_key, show.show_key, user.id)
    .first<{ nextIndex: number }>();

  return row?.nextIndex ?? 1;
}

async function insertShowEvent(
  env: ShowEngineEnv,
  input: {
    appKey: string;
    content: string;
    data?: Record<string, unknown>;
    eventType: ShowEventType;
    sessionId: string;
    showKey: string;
    speakerKey: string | null;
    speakerName: string;
    stageKey: string;
    turnId?: string | null;
    userId: string;
  },
): Promise<void> {
  const orderRow = await env.DB.prepare(
    `SELECT COALESCE(MAX(event_order), 0) + 1 AS nextOrder
     FROM show_events
     WHERE session_id = ? AND app_key = ? AND show_key = ? AND user_id = ?`,
  )
    .bind(input.sessionId, input.appKey, input.showKey, input.userId)
    .first<{ nextOrder: number }>();

  await env.DB.prepare(
    `INSERT INTO show_events (
       id, session_id, app_key, show_key, user_id, turn_id, event_order,
       event_type, speaker_key, speaker_name, content, stage_key, data
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      input.sessionId,
      input.appKey,
      input.showKey,
      input.userId,
      input.turnId ?? null,
      orderRow?.nextOrder ?? 1,
      input.eventType,
      input.speakerKey,
      input.speakerName,
      input.content,
      input.stageKey,
      JSON.stringify(input.data ?? {}),
    )
    .run();
}

function normalizeHardProfile(body: CreateSessionRequest, avatarObjectKey: string | null) {
  return {
    ageRange: normalizeShortText(body.ageRange, "", 60),
    avatarObjectKey,
    hobbies: splitUserList(body.hobbies).slice(0, 8),
    occupation: normalizeShortText(body.occupation, "", 120),
  };
}

function serializeHardProfileForSession(
  profile: ReturnType<typeof normalizeHardProfile>,
  derivedTags: string[],
) {
  return {
    ageRange: profile.ageRange,
    avatarObjectKey: profile.avatarObjectKey,
    derivedTags,
    hobbies: profile.hobbies,
    occupation: profile.occupation,
  };
}

async function upsertUserShowProfile(
  env: ShowEngineEnv,
  show: ShowTemplateRow,
  user: UserRecord,
  profile: ReturnType<typeof normalizeHardProfile>,
): Promise<void> {
  const existing = await getUserShowProfile(env, show, user);
  await env.DB.prepare(
    `INSERT INTO user_show_profiles (
       user_id, app_key, show_key, age_range, occupation, hobbies, avatar_object_key, derived_tags
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, app_key, show_key) DO UPDATE SET
       age_range = excluded.age_range,
       occupation = excluded.occupation,
       hobbies = excluded.hobbies,
       avatar_object_key = excluded.avatar_object_key,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      user.id,
      show.app_key,
      show.show_key,
      profile.ageRange,
      profile.occupation,
      JSON.stringify(profile.hobbies),
      profile.avatarObjectKey,
      existing?.derived_tags ?? "[]",
    )
    .run();
}

async function getUserShowProfile(
  env: ShowEngineEnv,
  show: ShowTemplateRow,
  user: UserRecord,
): Promise<UserShowProfileRow | null> {
  return env.DB.prepare(
    `SELECT age_range, occupation, hobbies, avatar_object_key, derived_tags, updated_at
     FROM user_show_profiles
     WHERE user_id = ? AND app_key = ? AND show_key = ?
     LIMIT 1`,
  )
    .bind(user.id, show.app_key, show.show_key)
    .first<UserShowProfileRow>();
}

function serializeUserShowProfile(row: UserShowProfileRow) {
  return {
    avatarObjectKey: row.avatar_object_key,
    derivedTags: readJsonArray<string>(row.derived_tags),
    displayName: row.occupation || "Player",
    hardIdentity: {
      ageRange: row.age_range,
      hobbies: readJsonArray<string>(row.hobbies),
      occupation: row.occupation,
    },
    updatedAt: row.updated_at,
  };
}

async function mergeDerivedProfileTags(
  env: ShowEngineEnv,
  input: {
    session: ShowSessionRow;
    show: ShowTemplateRow;
    signals: SignalExtraction;
    user: UserRecord;
  },
): Promise<void> {
  const tags = tagsFromSignals(input.signals);
  if (tags.length === 0) {
    return;
  }

  const currentProfile = await getUserShowProfile(env, input.show, input.user);
  const currentTags = currentProfile ? readJsonArray<string>(currentProfile.derived_tags) : [];
  const nextTags = uniqueStrings([...currentTags, ...tags]).slice(0, 12);
  await env.DB.prepare(
    `UPDATE user_show_profiles
     SET derived_tags = ?, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND app_key = ? AND show_key = ?`,
  )
    .bind(JSON.stringify(nextTags), input.user.id, input.show.app_key, input.show.show_key)
    .run();

  const sessionProfile = readJsonObject(input.session.user_profile);
  await env.DB.prepare(
    `UPDATE show_sessions
     SET user_profile = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  )
    .bind(JSON.stringify({ ...sessionProfile, derivedTags: nextTags }), input.session.id, input.user.id)
    .run();
}

async function getRecentSessions(
  env: ShowEngineEnv,
  show: ShowTemplateRow,
  user: UserRecord,
): Promise<WorkspaceSessionRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, show_key, avatar_object_key, avatar_label, audience_preference,
            current_stage_key, status, selected_character_key, result_summary,
            match_success, points_awarded, message_count, updated_at
     FROM show_sessions
     WHERE app_key = ? AND show_key = ? AND user_id = ?
     ORDER BY updated_at DESC
     LIMIT 5`,
  )
    .bind(show.app_key, show.show_key, user.id)
    .all<WorkspaceSessionRow>();

  return results;
}

async function getUserCompanions(env: ShowEngineEnv, show: ShowTemplateRow, user: UserRecord) {
  const { results } = await env.DB.prepare(
    `SELECT id, app_key, show_key, user_id, character_key, source_session_id, unlock_status,
            relationship_state, story_turn_count, last_story_at, snapshot, created_at, updated_at
     FROM user_companions
     WHERE app_key = ? AND show_key = ? AND user_id = ? AND unlock_status = ?
     ORDER BY COALESCE(last_story_at, updated_at) DESC`,
  )
    .bind(show.app_key, show.show_key, user.id, "unlocked")
    .all<UserCompanionRow>();

  return results.map(serializeCompanion);
}

async function unlockCompanion(
  env: ShowEngineEnv,
  input: {
    selectedCharacter: SessionCharacterRow;
    session: ShowSessionRow;
    show: ShowTemplateRow;
    user: UserRecord;
  },
): Promise<UserCompanionRow> {
  const existing = await env.DB.prepare(
    `SELECT id, app_key, show_key, user_id, character_key, source_session_id, unlock_status,
            relationship_state, story_turn_count, last_story_at, snapshot, created_at, updated_at
     FROM user_companions
     WHERE user_id = ? AND show_key = ? AND character_key = ?
     LIMIT 1`,
  )
    .bind(input.user.id, input.show.show_key, input.selectedCharacter.character_key)
    .first<UserCompanionRow>();
  const companionId = existing?.id ?? crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO user_companions (
       id, app_key, show_key, user_id, character_key, source_session_id,
       unlock_status, relationship_state, snapshot, last_story_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, show_key, character_key) DO UPDATE SET
       source_session_id = excluded.source_session_id,
       unlock_status = excluded.unlock_status,
       relationship_state = user_companions.relationship_state,
       snapshot = excluded.snapshot,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      companionId,
      input.show.app_key,
      input.show.show_key,
      input.user.id,
      input.selectedCharacter.character_key,
      input.session.id,
      "unlocked",
      "unlocked",
      input.selectedCharacter.snapshot,
    )
    .run();

  const companion = await requireCompanion(env, companionId, input.user);
  await ensureCompanionStoryTurn(env, input.show, companion, input.user);
  return companion;
}

async function requireCompanion(
  env: ShowEngineEnv,
  companionId: string,
  user: UserRecord,
): Promise<UserCompanionRow> {
  const companion = await env.DB.prepare(
    `SELECT id, app_key, show_key, user_id, character_key, source_session_id, unlock_status,
            relationship_state, story_turn_count, last_story_at, snapshot, created_at, updated_at
     FROM user_companions
     WHERE id = ? AND user_id = ? AND unlock_status = ?
     LIMIT 1`,
  )
    .bind(companionId, user.id, "unlocked")
    .first<UserCompanionRow>();

  if (!companion) {
    throw new Response("companion_not_found", { status: 404 });
  }

  return companion;
}

async function getCompanionStory(env: ShowEngineEnv, companionId: string, user: UserRecord) {
  const companion = await requireCompanion(env, companionId, user);
  const show = await requireShow(env, companion.show_key);
  const [turn, entitlement] = await Promise.all([
    ensureCompanionStoryTurn(env, show, companion, user),
    getEntitlement(env, user, show),
  ]);
  const recentTurns = await getCompanionStoryTurns(env, companion, user);
  const freeLimit = readFreeCompanionStoryTurns(show);

  return {
    companion: serializeCompanion(companion),
    currentTurn: turn ? serializeCompanionStoryTurn(turn) : null,
    entitlement,
    freeTurnLimit: freeLimit,
    paywallRequired: !entitlement.active && companion.story_turn_count >= freeLimit && !turn,
    recentTurns: recentTurns.map(serializeCompanionStoryTurn),
    show: serializeShow(show),
  };
}

async function answerCompanionStoryTurn(
  env: ShowEngineEnv,
  companionId: string,
  turnId: string,
  body: CompanionStoryAnswerRequest,
) {
  const email = normalizeEmail(body.email);
  if (!email) {
    throw new Response("email_required", { status: 400 });
  }

  const user = await ensureUserByEmail(env, email);
  const companion = await requireCompanion(env, companionId, user);
  const show = await requireShow(env, companion.show_key);
  const entitlement = await getEntitlement(env, user, show);
  const freeLimit = readFreeCompanionStoryTurns(show);
  if (shouldRequirePlatformPass({
    activeEntitlement: entitlement.active,
    freeTurnLimit: freeLimit,
    storyTurnCount: companion.story_turn_count,
  })) {
    throw jsonResponse({ error: "platform_pass_required", freeTurnLimit: freeLimit, paywallRequired: true }, { status: 402 });
  }

  const turn = await requireCompanionStoryTurn(env, companion, turnId, user);
  if (turn.status !== "awaiting_user") {
    throw new Response("story_turn_already_answered", { status: 409 });
  }

  const options = readCompanionStoryOptions(turn.options);
  const selectedOption = options.find((option) => option.id === normalizeShortText(body.selectedOptionId, "", 80)) ?? null;
  const freeText = normalizeShortText(body.freeText, "", 1000);
  if (!selectedOption && !freeText) {
    throw new Response("answer_required", { status: 400 });
  }

  const answerText = [selectedOption?.preview, freeText].filter(Boolean).join(" ");
  const responseText = buildCompanionResponseLine({
    companionName: companionNameFromSnapshot(companion.snapshot),
    freeText,
    selectedOption,
  });
  await env.DB.prepare(
    `UPDATE companion_story_turns
     SET selected_option_id = ?, answer_text = ?, response_text = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND companion_id = ? AND user_id = ?`,
  )
    .bind(selectedOption?.id ?? null, answerText, responseText, "answered", turn.id, companion.id, user.id)
    .run();

  const nextCount = companion.story_turn_count + 1;
  const relationshipState = nextCount >= 2 ? "warming_up" : "unlocked";
  await env.DB.prepare(
    `UPDATE user_companions
     SET story_turn_count = ?, relationship_state = ?, last_story_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  )
    .bind(nextCount, relationshipState, companion.id, user.id)
    .run();

  const updatedCompanion = await requireCompanion(env, companion.id, user);
  if (entitlement.active || nextCount < freeLimit) {
    await createCompanionStoryTurn(env, show, updatedCompanion, user);
  }

  return getCompanionStory(env, companion.id, user);
}

async function ensureCompanionStoryTurn(
  env: ShowEngineEnv,
  show: ShowTemplateRow,
  companion: UserCompanionRow,
  user: UserRecord,
): Promise<CompanionStoryTurnRow | null> {
  const current = await getCurrentCompanionStoryTurn(env, companion, user);
  if (current) {
    return current;
  }

  const entitlement = await getEntitlement(env, user, show);
  if (shouldRequirePlatformPass({
    activeEntitlement: entitlement.active,
    freeTurnLimit: readFreeCompanionStoryTurns(show),
    storyTurnCount: companion.story_turn_count,
  })) {
    return null;
  }

  return createCompanionStoryTurn(env, show, companion, user);
}

async function getCurrentCompanionStoryTurn(
  env: ShowEngineEnv,
  companion: UserCompanionRow,
  user: UserRecord,
): Promise<CompanionStoryTurnRow | null> {
  return env.DB.prepare(
    `SELECT id, turn_index, scene_title, prompt, options, selected_option_id,
            answer_text, response_text, status, created_at, updated_at
     FROM companion_story_turns
     WHERE companion_id = ? AND user_id = ? AND status = ?
     ORDER BY turn_index DESC
     LIMIT 1`,
  )
    .bind(companion.id, user.id, "awaiting_user")
    .first<CompanionStoryTurnRow>();
}

async function getCompanionStoryTurns(
  env: ShowEngineEnv,
  companion: UserCompanionRow,
  user: UserRecord,
): Promise<CompanionStoryTurnRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, turn_index, scene_title, prompt, options, selected_option_id,
            answer_text, response_text, status, created_at, updated_at
     FROM companion_story_turns
     WHERE companion_id = ? AND user_id = ?
     ORDER BY turn_index ASC
     LIMIT 20`,
  )
    .bind(companion.id, user.id)
    .all<CompanionStoryTurnRow>();

  return results;
}

async function requireCompanionStoryTurn(
  env: ShowEngineEnv,
  companion: UserCompanionRow,
  turnId: string,
  user: UserRecord,
): Promise<CompanionStoryTurnRow> {
  const turn = await env.DB.prepare(
    `SELECT id, turn_index, scene_title, prompt, options, selected_option_id,
            answer_text, response_text, status, created_at, updated_at
     FROM companion_story_turns
     WHERE id = ? AND companion_id = ? AND user_id = ?
     LIMIT 1`,
  )
    .bind(turnId, companion.id, user.id)
    .first<CompanionStoryTurnRow>();

  if (!turn) {
    throw new Response("story_turn_not_found", { status: 404 });
  }

  return turn;
}

async function createCompanionStoryTurn(
  env: ShowEngineEnv,
  show: ShowTemplateRow,
  companion: UserCompanionRow,
  user: UserRecord,
): Promise<CompanionStoryTurnRow> {
  const turnIndex = companion.story_turn_count + 1;
  const snapshot = parseSnapshot(companion.snapshot) as CharacterSnapshot;
  const name = typeof snapshot.name === "string" ? snapshot.name : "your companion";
  const scenes = companionStoryScenes(name);
  const scene = scenes[(turnIndex - 1) % scenes.length] ?? scenes[0]!;
  const turnId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO companion_story_turns (
       id, companion_id, app_key, show_key, user_id, turn_index, scene_title, prompt, options
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(turnId, companion.id, show.app_key, show.show_key, user.id, turnIndex, scene.sceneTitle, scene.prompt, JSON.stringify(scene.options))
    .run();

  return requireCompanionStoryTurn(env, companion, turnId, user);
}

function readFreeCompanionStoryTurns(show: ShowTemplateRow): number {
  const config = readJsonObject(show.config);
  const value = config.freeCompanionStoryTurns;
  return typeof value === "number" && value >= 0 ? value : 2;
}

function readChapterOneSlotCount(show: ShowTemplateRow): number {
  const config = readJsonObject(show.config);
  const value = typeof config.chapterOneSlotCount === "number"
    ? config.chapterOneSlotCount
    : typeof config.lineupSlotCount === "number"
      ? config.lineupSlotCount
      : typeof config.slotCount === "number"
        ? config.slotCount
        : 5;
  return clamp(Math.round(value), 1, 5);
}

function companionNameFromSnapshot(snapshotValue: string): string {
  const snapshot = parseSnapshot(snapshotValue) as CharacterSnapshot;
  return typeof snapshot.name === "string" ? snapshot.name : "They";
}

async function getPointSummary(env: ShowEngineEnv, show: ShowTemplateRow, user: UserRecord) {
  const summary = await env.DB.prepare(
    `SELECT COALESCE(SUM(points), 0) AS totalPoints, COUNT(*) AS eventCount
     FROM platform_point_events
     WHERE app_key = ? AND show_key = ? AND user_id = ?`,
  )
    .bind(show.app_key, show.show_key, user.id)
    .first<{ eventCount: number; totalPoints: number }>();
  const { results } = await env.DB.prepare(
    `SELECT event_type, points, created_at
     FROM platform_point_events
     WHERE app_key = ? AND show_key = ? AND user_id = ?
     ORDER BY created_at DESC
     LIMIT 5`,
  )
    .bind(show.app_key, show.show_key, user.id)
    .all<WorkspacePointEventRow>();

  return {
    eventCount: summary?.eventCount ?? 0,
    recentEvents: results.map((event) => ({
      createdAt: event.created_at,
      eventType: event.event_type,
      points: event.points,
    })),
    totalPoints: summary?.totalPoints ?? 0,
  };
}

async function getAssetSummary(env: ShowEngineEnv, keys: string[]) {
  if (keys.length === 0) {
    return {
      count: 0,
      objects: [],
      totalSizeBytes: 0,
    };
  }

  const placeholders = keys.map(() => "?").join(", ");
  const { results } = await env.DB.prepare(
    `SELECT key, content_type, size_bytes, created_at
     FROM asset_objects
     WHERE key IN (${placeholders})
     ORDER BY created_at DESC`,
  )
    .bind(...keys)
    .all<WorkspaceAssetRow>();
  const metadataByKey = new Map(results.map((asset) => [asset.key, asset]));
  const objects = keys.map((key) => {
    const metadata = metadataByKey.get(key);
    return {
      contentType: metadata?.content_type ?? null,
      createdAt: metadata?.created_at ?? null,
      key,
      sizeBytes: metadata?.size_bytes ?? null,
    };
  });

  return {
    count: keys.length,
    objects,
    totalSizeBytes: objects.reduce((sum, asset) => sum + (asset.sizeBytes ?? 0), 0),
  };
}

async function getEntitlement(env: ShowEngineEnv, user: UserRecord, show: ShowTemplateRow) {
  const subscription = await env.DB.prepare(
    `SELECT status
     FROM stripe_subscriptions
     WHERE app_key = ? AND (user_id = ? OR email = ?)
     ORDER BY updated_at DESC
     LIMIT 1`,
  )
    .bind(PLATFORM_APP_KEY, user.id, user.email)
    .first<{ status: string }>();
  const active = ["active", "trialing", "checkout_completed"].includes(subscription?.status ?? "");

  return {
    active,
    freeMessageLimit: readFreeMessageLimit(env, show),
    mode: active ? "platform_pass" : "free_trial",
    status: subscription?.status ?? "none",
  };
}

function freeEntitlement(env: ShowEngineEnv, show: ShowTemplateRow) {
  return {
    active: false,
    freeMessageLimit: readFreeMessageLimit(env, show),
    mode: "free_trial",
    status: "anonymous",
  };
}

async function insertMessage(
  env: ShowEngineEnv,
  input: {
    appKey: string;
    content: string;
    role: MessageRole;
    sessionId: string;
    showKey: string;
    speakerKey: string;
    speakerName: string;
    stageKey: string;
    userId: string;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO show_messages (
       id, session_id, app_key, show_key, user_id, role, speaker_key, speaker_name, content, stage_key
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      input.sessionId,
      input.appKey,
      input.showKey,
      input.userId,
      input.role,
      input.speakerKey,
      input.speakerName,
      input.content,
      input.stageKey,
    )
    .run();
}

async function judgeTurnSemantics(
  env: ShowEngineEnv,
  input: {
    answerText: string;
    pickedGuestKey: string | null;
    selectedOption: TurnOption | null;
    session: ShowSessionRow;
    sessionId: string;
    show: ShowTemplateRow;
    turn: ShowTurnRow;
    user: UserRecord;
  },
): Promise<SemanticTurnJudgment> {
  const guests = (await getSessionCharacters(env, input.show, input.sessionId, input.user)).filter(
    (character) => character.role === "guest",
  );
  const fallback = buildFallbackSemanticJudgment({
    answerText: input.answerText,
    guests,
    pickedGuestKey: input.pickedGuestKey,
  });
  const guestContext = guests.map((guest) => {
    const snapshot = parseSnapshot(guest.snapshot) as CharacterSnapshot;
    return {
      boundaries: snapshot.boundaries,
      characterKey: guest.character_key,
      currentAffinity: guest.affinity_score,
      dealbreakerSignals: asStringArray(snapshot.dealbreakerSignals),
      goal: snapshot.goal,
      hiddenPreferences: snapshot.hiddenPreferences,
      lightState: guest.light_state,
      name: guest.name,
      negativeSignals: asStringArray(snapshot.negativeSignals),
      personality: snapshot.personality,
      positiveSignals: asStringArray(snapshot.positiveSignals),
      speakingStyle: snapshot.speakingStyle,
    };
  });

  const result = await generateText(env, {
    fallbackText: JSON.stringify(fallback),
    maxOutputTokens: 900,
    maxTextLength: 6000,
    messages: [
      {
        content: [
          "You are a structured semantic judge for an interactive companion dating-show chapter.",
          "Read the user's answer and each Guest's character card.",
          "Return compact JSON only. Do not include markdown.",
          "Do not write character dialogue.",
          "Score deltas must be integers from -35 to 24.",
          "Use positive delta when the answer matches a Guest's goals, preferences, or emotional style.",
          "Use negative delta when the answer conflicts with boundaries, risks, or dealbreakers.",
          "Every Guest must receive exactly one judgment.",
        ].join(" "),
        role: "system",
      },
      {
        content: [
          `Schema: {"userIntent":"short","expressionTraits":["tag"],"guestJudgments":[{"characterKey":"guest-key","delta":0,"reason":"short user-visible reason","attractionTags":["tag"],"riskTags":["tag"]}]}`,
          `Show: ${input.show.title}`,
          `Premise: ${input.show.premise}`,
          `Stage: ${input.turn.stage_key}`,
          `Question: ${input.turn.question}`,
          `Selected option: ${input.selectedOption?.label ?? "none"} / ${input.selectedOption?.preview ?? "none"}`,
          `Picked guest: ${input.pickedGuestKey ?? "none"}`,
          `User answer: ${input.answerText}`,
          `Guests: ${JSON.stringify(guestContext)}`,
        ].join("\n"),
        role: "user",
      },
    ],
    metadata: {
      appKey: input.session.app_key,
      purpose: "show_semantic_judgment",
      sessionId: input.session.id,
      showKey: input.show.show_key,
      stageKey: input.turn.stage_key,
      userId: input.user.id,
    },
    route: "cheap-dialogue",
    temperature: 0.2,
  });

  if (result.fallbackUsed) {
    return fallback;
  }

  const parsed = parseJsonObject(result.text);
  return parsed ? normalizeSemanticJudgment(parsed, fallback, guests, "llm") : fallback;
}

function buildFallbackSemanticJudgment(input: {
  answerText: string;
  guests: SessionCharacterRow[];
  pickedGuestKey: string | null;
}): SemanticTurnJudgment {
  const signals = extractSignals(input.answerText);
  return {
    expressionTraits: uniqueStrings([...signals.positiveSignals, ...signals.negativeSignals]).slice(0, 8),
    guestJudgments: input.guests.map((guest) => {
      const snapshot = parseSnapshot(guest.snapshot) as CharacterSnapshot;
      const positiveSignals = asStringArray(snapshot.positiveSignals);
      const negativeSignals = asStringArray(snapshot.negativeSignals);
      const dealbreakerSignals = asStringArray(snapshot.dealbreakerSignals);
      const attractionTags = signals.positiveSignals.filter((signal) => positiveSignals.includes(signal));
      const riskTags = uniqueStrings([
        ...signals.negativeSignals.filter((signal) => negativeSignals.includes(signal)),
        ...signals.dealbreakerSignals.filter((signal) => dealbreakerSignals.includes(signal)),
      ]);
      const outcome = applySignalsToGuest(
        {
          affinityScore: guest.affinity_score,
          blowUpSignals: asStringArray(snapshot.blowUpSignals),
          characterKey: guest.character_key,
          dealbreakerSignals,
          dealbreakerTriggered: guest.dealbreaker_triggered === 1,
          lightState: guest.light_state,
          name: guest.name,
          negativeSignals,
          positiveSignals,
          strongSignalCount: guest.strong_signal_count,
        },
        signals,
        1,
      );
      const pickedBoost = input.pickedGuestKey === guest.character_key ? 6 : 0;
      const delta = clamp((outcome?.delta ?? 0) + pickedBoost, -35, 24);

      return {
        attractionTags,
        characterKey: guest.character_key,
        delta,
        reason: semanticFallbackReason(guest.name, delta, attractionTags, riskTags, input.pickedGuestKey === guest.character_key),
        riskTags,
      };
    }),
    source: "fallback",
    userIntent: normalizeShortText(input.answerText, "The user is trying to answer the room honestly.", 180),
  };
}

function normalizeSemanticJudgment(
  value: Record<string, unknown>,
  fallback: SemanticTurnJudgment,
  guests: SessionCharacterRow[],
  source: SemanticTurnJudgment["source"],
): SemanticTurnJudgment {
  const rawJudgments = Array.isArray(value.guestJudgments) ? value.guestJudgments : [];
  const byKey = new Map<string, Record<string, unknown>>();
  for (const raw of rawJudgments) {
    if (!raw || typeof raw !== "object") {
      continue;
    }

    const item = raw as Record<string, unknown>;
    const key = typeof item.characterKey === "string" ? item.characterKey : "";
    if (key) {
      byKey.set(key, item);
    }
  }
  const fallbackByKey = new Map(fallback.guestJudgments.map((judgment) => [judgment.characterKey, judgment]));

  return {
    expressionTraits: asStringArray(value.expressionTraits).slice(0, 8),
    guestJudgments: guests.map((guest) => {
      const raw = byKey.get(guest.character_key);
      const fallbackJudgment = fallbackByKey.get(guest.character_key);
      return {
        attractionTags: asStringArray(raw?.attractionTags).slice(0, 8),
        characterKey: guest.character_key,
        delta: clamp(Math.round(typeof raw?.delta === "number" ? raw.delta : fallbackJudgment?.delta ?? 0), -35, 24),
        reason: normalizeShortText(
          typeof raw?.reason === "string" ? raw.reason : fallbackJudgment?.reason,
          fallbackJudgment?.reason ?? `${guest.name} is still reading your signal.`,
          180,
        ),
        riskTags: asStringArray(raw?.riskTags).slice(0, 8),
      };
    }),
    source,
    userIntent: normalizeShortText(
      typeof value.userIntent === "string" ? value.userIntent : fallback.userIntent,
      fallback.userIntent,
      180,
    ),
  };
}

function semanticFallbackReason(name: string, delta: number, attractionTags: string[], riskTags: string[], picked: boolean): string {
  if (riskTags.length > 0 || delta < 0) {
    return `${name} noticed friction around ${riskTags.slice(0, 2).join(", ") || "your answer"} and becomes more cautious.`;
  }

  if (delta > 0) {
    return `${name} feels a stronger signal from ${attractionTags.slice(0, 2).join(", ") || (picked ? "being chosen" : "your answer")}.`;
  }

  return `${name} is listening, but the answer does not shift their signal much yet.`;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function generateShowLine(
  env: ShowEngineEnv,
  input: {
    content: string;
    host?: SessionCharacterRow;
    nextAffinity: number;
    role: "host" | "character";
    selectedCharacter?: SessionCharacterRow;
    session: ShowSessionRow;
    show: ShowTemplateRow;
    stage: ShowStageRow;
    stream?: TurnAnswerOptions;
  },
): Promise<string> {
  const fallbackText = fallbackShowLine(input);
  const selectedSnapshot = input.selectedCharacter ? parseSnapshot(input.selectedCharacter.snapshot) : null;
  const messages: LlmMessage[] = [
    {
      content: [
      "You write concise, safe, PG-13 dialogue for an interactive AI companion story game.",
      "Use the structured show, stage, and character context.",
      "Keep the tone entertaining and in-format.",
      "Never generate explicit sexual content, identity verification claims, deepfake claims, or coercive pressure.",
      "For guest lines, write only words the guest says aloud.",
      "Do not include parenthetical actions, bracketed stage directions, inner thoughts, camera notes, narration, or speaker-name prefixes.",
      "Return one line only.",
      ].join(" "),
      role: "system",
    },
    {
      content: [
      `Show title: ${input.show.title}`,
      `Show premise: ${input.show.premise}`,
      `Ending rules: ${input.show.ending_rules}`,
      `Stage: ${input.stage.stage_key} - ${input.stage.goal}`,
      `Host instruction: ${input.stage.host_instruction}`,
      `Role to write: ${input.role}`,
      `User message: ${input.content}`,
      `Selected character: ${input.selectedCharacter?.name ?? "none"}`,
      `Character snapshot: ${selectedSnapshot ? JSON.stringify(selectedSnapshot) : "host only"}`,
      `Affinity score: ${input.nextAffinity}`,
      input.role === "character"
        ? "Write a single spoken guest reply under 45 words. React to the user's latest message and, when natural, ask one grounded follow-up question."
        : "Write a single lightweight host transition or room summary under 45 words.",
      ].join("\n"),
      role: "user",
    },
  ];

  const result = await generateText(env, {
    fallbackText,
    maxOutputTokens: 160,
    messages,
    metadata: {
      appKey: input.session.app_key,
      purpose: input.role === "host" ? "show_host_line" : "show_character_line",
      sessionId: input.session.id,
      showKey: input.show.show_key,
      stageKey: input.stage.stage_key,
      userId: input.session.user_id,
    },
    onDelta: input.stream?.onDelta
      ? (text) => input.stream?.onDelta?.(text, {
        speakerKey: input.role === "host" ? "host" : input.selectedCharacter?.character_key ?? null,
        speakerName: input.role === "host" ? "Host" : input.selectedCharacter?.name ?? null,
      })
      : undefined,
    route: "cheap-dialogue",
    stream: input.stream?.stream,
    temperature: 0.7,
  });

  return sanitizeGeneratedLine(
    normalizeShortText(result.text, fallbackText, 360),
    fallbackText,
    input.selectedCharacter?.name ?? (input.role === "host" ? "Host" : undefined),
  );
}

function sanitizeGeneratedLine(text: string, fallbackText: string, speakerName?: string): string {
  let sanitized = text
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (speakerName) {
    const escapedName = escapeRegExp(speakerName);
    sanitized = sanitized.replace(new RegExp(`^${escapedName}\\s*[:\\-]\\s*`, "i"), "").trim();
  }

  sanitized = sanitized
    .replace(/^(host|guest|speaker|character)\s*[:\-]\s*/i, "")
    .replace(/^["']+|["']+$/g, "")
    .trim();

  return sanitized || fallbackText;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fallbackShowLine(input: {
  nextAffinity: number;
  role: "host" | "character";
  selectedCharacter?: SessionCharacterRow;
  session: ShowSessionRow;
  stage: ShowStageRow;
}): string {
  if (input.role === "host") {
    if (input.stage.stage_key === "final_choice") {
      return "The lights are softening. One more honest answer, and then it is time for the final choice.";
    }

    return `The studio reacts to that answer. I can feel the room leaning in, especially ${input.selectedCharacter?.name ?? "the guests"}.`;
  }

  const name = input.selectedCharacter?.name ?? "Guest";
  if (input.nextAffinity >= 65) {
    return `${name}: That actually lands with me. It feels like you are not just performing for the cameras.`;
  }

  if (input.nextAffinity <= 40) {
    return `${name}: I am curious, but I need a little more honesty before I turn my light brighter.`;
  }

  return `${name}: Interesting answer. I am not fully convinced yet, but I want to hear where this goes.`;
}

function serializeShow(row: ShowTemplateRow) {
  return {
    appKey: row.app_key,
    backgroundImageKey: row.background_image_key,
    endingRules: row.ending_rules,
    openingScene: row.opening_scene,
    premise: row.premise,
    showKey: row.show_key,
    showType: row.show_type,
    subtitle: row.subtitle,
    title: row.title,
  };
}

function serializeStage(row: ShowStageRow) {
  return {
    allowedUserActions: readJsonArray<string>(row.allowed_user_actions),
    autoAdvanceAfterMessages: row.auto_advance_after_messages,
    goal: row.goal,
    hostInstruction: row.host_instruction,
    isFinal: row.is_final === 1,
    stageKey: row.stage_key,
    title: row.title,
  };
}

function serializeCharacter(row: ShowCharacterRow) {
  return characterDefinitionToSnapshot(toCharacterDefinition(row));
}

function serializePublicCharacter(row: ShowCharacterRow) {
  const characterPackage = row.role === "guest" ? guestPackageFromRow(row) : null;
  const visualStateObjectKey = characterPackage ? selectGuestVisualObjectKey(characterPackage) : null;
  const visibility = readCharacterVisibility(row);

  return {
    ...publicCharacterProfile(readJsonObject(row.public_profile)),
    avatarObjectKey: row.avatar_object_key,
    characterKey: row.character_key,
    gender: row.gender,
    id: row.character_key,
    name: row.name,
    portraitObjectKey: characterPackage?.assets.portraitObjectKey ?? null,
    role: row.role,
    source: row.source,
    statusLabel: row.source === "user" ? (visibility === "public" ? "community" : "custom") : "ready",
    visibility,
    visualStateObjectKey,
  };
}

function canReadCharacter(row: ShowCharacterRow, user: UserRecord | null): boolean {
  return row.source === "official" || isOwnedCharacter(row, user) || isCommunityCharacter(row);
}

function isOwnedCharacter(row: ShowCharacterRow, user: UserRecord | null): boolean {
  return row.source === "user" && Boolean(user?.id) && row.owner_user_id === user?.id;
}

function isCommunityCharacter(row: ShowCharacterRow): boolean {
  return row.source === "user" && readCharacterVisibility(row) === "public";
}

function readCharacterVisibility(row: ShowCharacterRow): "private" | "public" {
  const profile = readJsonObject(row.public_profile);
  return profile.visibility === "public" ? "public" : "private";
}

function withCharacterVisibility(profile: Record<string, unknown>): Record<string, unknown> {
  return {
    ...profile,
    visibility: profile.visibility === "public" ? "public" : "private",
  };
}

function serializeCharacterPackageResponse(row: ShowCharacterRow) {
  const characterPackage = guestPackageFromRow(row);
  return {
    character: serializePublicCharacter(row),
    characterPackage,
    visualStateObjectKey: selectGuestVisualObjectKey(characterPackage),
  };
}

function characterAssetKeys(row: ShowCharacterRow): Array<string | null> {
  const characterPackage = row.role === "guest" ? guestPackageFromRow(row) : null;
  if (!characterPackage) {
    return [row.avatar_object_key];
  }

  return [
    characterPackage.assets.avatarObjectKey,
    characterPackage.assets.portraitObjectKey,
    ...characterPackage.assets.galleryObjectKeys,
    ...Object.values(characterPackage.assets.visualStates).map((visual) => visual.objectKey),
  ];
}

function publicCharacterProfile(profile: Record<string, unknown>) {
  return {
    ageRange: typeof profile.ageRange === "string" ? profile.ageRange : undefined,
    cityOrLifestyle: typeof profile.cityOrLifestyle === "string" ? profile.cityOrLifestyle : undefined,
    hobbies: readPublicStringList(profile.hobbies),
    occupationTag: typeof profile.occupationTag === "string" ? profile.occupationTag : undefined,
    personalityKeywords: readPublicStringList(profile.personalityKeywords),
    preferences: readPublicStringList(profile.preferences),
  };
}

function readPublicStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 8) : [];
}

function serializeSessionCharacter(row: SessionCharacterRow) {
  const snapshot = parseSnapshot(row.snapshot) as CharacterSnapshot;
  return {
    available: row.is_available === 1,
    avatarObjectKey: typeof snapshot.avatarObjectKey === "string" ? snapshot.avatarObjectKey : null,
    characterKey: row.character_key,
    gender: snapshot.gender,
    lightState: row.light_state,
    name: row.name,
    profile: {
      ...publicCharacterProfile(snapshot),
      avatarObjectKey: typeof snapshot.avatarObjectKey === "string" ? snapshot.avatarObjectKey : null,
      characterKey: row.character_key,
      gender: snapshot.gender,
      name: row.name,
      source: snapshot.source,
    },
    role: row.role,
  };
}

function serializeSessionGuest(row: SessionCharacterRow) {
  const snapshot = parseSnapshot(row.snapshot) as CharacterSnapshot;
  return {
    available: row.is_available === 1,
    gender: snapshot.gender,
    guestTemplateId: row.character_key,
    characterKey: row.character_key,
    lightState: row.light_state,
    name: row.name,
    profile: {
      ...publicCharacterProfile(snapshot),
      avatarObjectKey: typeof snapshot.avatarObjectKey === "string" ? snapshot.avatarObjectKey : null,
      characterKey: row.character_key,
      gender: snapshot.gender,
      name: row.name,
      source: snapshot.source,
    },
  };
}

function serializeSession(row: ShowSessionRow) {
  return {
    audiencePreference: row.audience_preference,
    avatarLabel: row.avatar_label,
    avatarObjectKey: row.avatar_object_key,
    currentStage: row.current_stage_key,
    currentStageKey: row.current_stage_key,
    guestPreference: row.audience_preference,
    id: row.id,
    initialPickCharacterKey: row.initial_pick_character_key,
    matchSuccess: row.match_success === 1,
    messageCount: row.message_count,
    pointsAwarded: row.points_awarded,
    resultSummary: row.result_summary,
    selectedCharacterKey: row.selected_character_key,
    selectedGuestTemplateId: row.selected_character_key,
    showKey: row.show_key,
    status: row.status,
    updatedAt: row.updated_at,
    userDeclaration: row.user_declaration,
    userProfile: readJsonObject(row.user_profile),
  };
}

function serializeWorkspaceSession(row: WorkspaceSessionRow) {
  return {
    audiencePreference: row.audience_preference,
    avatarLabel: row.avatar_label,
    avatarObjectKey: row.avatar_object_key,
    currentStage: row.current_stage_key,
    id: row.id,
    matchSuccess: row.match_success === 1,
    messageCount: row.message_count,
    pointsAwarded: row.points_awarded,
    resultSummary: row.result_summary,
    selectedCharacterKey: row.selected_character_key,
    showKey: row.show_key,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function serializeCompanion(row: UserCompanionRow) {
  const snapshot = parseSnapshot(row.snapshot) as CharacterSnapshot;
  const profile = publicCharacterProfile(snapshot);
  return {
    avatarObjectKey: typeof snapshot.avatarObjectKey === "string" ? snapshot.avatarObjectKey : null,
    characterKey: row.character_key,
    id: row.id,
    lastStoryAt: row.last_story_at,
    name: typeof snapshot.name === "string" ? snapshot.name : row.character_key,
    profile,
    relationshipState: row.relationship_state,
    sourceSessionId: row.source_session_id,
    storyTurnCount: row.story_turn_count,
    unlockStatus: row.unlock_status,
    updatedAt: row.updated_at,
  };
}

function serializeCompanionStoryTurn(row: CompanionStoryTurnRow) {
  return {
    answerText: row.answer_text,
    createdAt: row.created_at,
    id: row.id,
    options: readCompanionStoryOptions(row.options),
    prompt: row.prompt,
    responseText: row.response_text,
    sceneTitle: row.scene_title,
    selectedOptionId: row.selected_option_id,
    status: row.status,
    turnIndex: row.turn_index,
    updatedAt: row.updated_at,
  };
}

function serializeMessage(row: ShowMessageRow) {
  return {
    content: row.content,
    createdAt: row.created_at,
    id: row.id,
    role: row.role === "character" ? "guest" : row.role,
    speakerId: row.speaker_key,
    speakerKey: row.speaker_key,
    speakerName: row.speaker_name,
    stage: row.stage_key,
    stageKey: row.stage_key,
  };
}

function serializeTurn(row: ShowTurnRow) {
  return {
    answerText: row.answer_text,
    createdAt: row.created_at,
    id: row.id,
    options: readTurnOptions(row.options).map(({ id, label, preview }) => ({ id, label, preview })),
    question: row.question,
    selectedCharacterKey: row.selected_character_key,
    selectedOptionId: row.selected_option_id,
    speakerKey: row.speaker_key,
    speakerName: row.speaker_name,
    stage: row.stage_key,
    stageKey: row.stage_key,
    status: row.status,
    turnIndex: row.turn_index,
    updatedAt: row.updated_at,
  };
}

function serializeEvent(row: ShowEventRow) {
  return {
    content: row.content,
    createdAt: row.created_at,
    data: readJsonObject(row.data),
    eventOrder: row.event_order,
    id: row.id,
    speakerKey: row.speaker_key,
    speakerName: row.speaker_name,
    stage: row.stage_key,
    stageKey: row.stage_key,
    turnId: row.turn_id,
    type: row.event_type,
  };
}

type SerializedEvent = ReturnType<typeof serializeEvent>;

function serializeGuestStates(guests: SessionCharacterRow[], events: SerializedEvent[]) {
  const deltasByKey = new Map<string, ReturnType<typeof readGuestDelta>>();
  for (const event of events) {
    const deltas = Array.isArray(event.data.guestDeltas) ? event.data.guestDeltas : [];
    for (const rawDelta of deltas) {
      const delta = readGuestDelta(rawDelta);
      if (delta) {
        deltasByKey.set(delta.characterKey, delta);
      }
    }
  }

  return guests.map((guest) => {
    const delta = deltasByKey.get(guest.character_key);
    return {
      affinityScore: guest.affinity_score,
      attractionTags: delta?.attractionTags ?? [],
      available: guest.is_available === 1,
      characterKey: guest.character_key,
      lastDelta: delta?.delta ?? 0,
      lastReason: delta?.reason ?? "",
      lightState: guest.light_state,
      name: guest.name,
      riskTags: delta?.riskTags ?? [],
    };
  });
}

function serializeGeneratedReactions(events: SerializedEvent[]) {
  return events
    .filter((event) => event.type === "guest_reaction" && event.data.generatedReaction === true)
    .slice(-4)
    .map((event) => ({
      characterKey: event.speakerKey,
      reason: typeof event.data.reason === "string" ? event.data.reason : "",
      speakerName: event.speakerName,
      text: event.content,
    }));
}

function readGuestDelta(value: unknown): {
  attractionTags: string[];
  characterKey: string;
  delta: number;
  reason: string;
  riskTags: string[];
} | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const characterKey = typeof record.characterKey === "string" ? record.characterKey : "";
  if (!characterKey) {
    return null;
  }

  return {
    attractionTags: asStringArray(record.attractionTags),
    characterKey,
    delta: typeof record.delta === "number" ? record.delta : 0,
    reason: typeof record.reason === "string" ? record.reason : "",
    riskTags: asStringArray(record.riskTags),
  };
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function uniqueCharacters(values: ShowCharacterRow[]): ShowCharacterRow[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.character_key)) {
      return false;
    }

    seen.add(value.character_key);
    return true;
  });
}

function buildTurnDraft(input: {
  guests: SessionCharacterRow[];
  host?: SessionCharacterRow;
  session: ShowSessionRow;
  stageKey: string;
}): TurnDraft | null {
  return buildDomainTurnDraft({
    guests: input.guests.map(toStageGuest),
    host: input.host ? toStageGuest(input.host) : undefined,
    session: {
      initialPickCharacterKey: input.session.initial_pick_character_key,
      messageCount: input.session.message_count,
      userProfile: input.session.user_profile,
    },
    stageKey: input.stageKey,
  });
}

function toStageGuest(guest: SessionCharacterRow) {
  return {
    affinityScore: guest.affinity_score,
    characterKey: guest.character_key,
    isAvailable: guest.is_available === 1,
    lightState: guest.light_state,
    name: guest.name,
  };
}

function readTurnOptions(value: string): TurnOption[] {
  return readJsonArray<Record<string, unknown>>(value)
    .map((option) => ({
      id: typeof option.id === "string" ? option.id : "",
      label: typeof option.label === "string" ? option.label : "",
      preview: typeof option.preview === "string" ? option.preview : "",
      signalText: typeof option.signalText === "string" ? option.signalText : "",
    }))
    .filter((option) => option.id && option.label && option.preview);
}

function readTurnRoundsBeforeDeclaration(show: ShowTemplateRow): number {
  const config = readJsonObject(show.config);
  const value = config.turnRoundsBeforeDeclaration;
  return typeof value === "number" && value > 0 ? value : 3;
}

async function emitTextDelta(
  options: TurnAnswerOptions | undefined,
  content: string,
  meta?: TurnAnswerDeltaMeta,
): Promise<void> {
  if (!options?.stream || !options.onDelta || !content.trim()) {
    return;
  }

  const chunks = content.match(/.{1,18}(?:\s|$)/g) ?? [content];
  for (const chunk of chunks) {
    if (chunk) {
      await options.onDelta(chunk, meta);
    }
  }
}

async function insertHostSummary(
  env: ShowEngineEnv,
  input: {
    content: string;
    session: ShowSessionRow;
    show: ShowTemplateRow;
    stageKey: string;
    stream?: TurnAnswerOptions;
    user: UserRecord;
  },
): Promise<void> {
  await emitTextDelta(input.stream, input.content, {
    speakerKey: "host",
    speakerName: "Host",
  });
  await insertMessage(env, {
    appKey: input.show.app_key,
    content: input.content,
    role: "host",
    sessionId: input.session.id,
    showKey: input.show.show_key,
    speakerKey: "host",
    speakerName: "Host",
    stageKey: input.stageKey,
    userId: input.user.id,
  });
  await insertShowEvent(env, {
    appKey: input.show.app_key,
    content: input.content,
    eventType: "host_summary",
    sessionId: input.session.id,
    showKey: input.show.show_key,
    speakerKey: "host",
    speakerName: "Host",
    stageKey: input.stageKey,
    userId: input.user.id,
  });
}

async function emitReactionEvents(
  env: ShowEngineEnv,
  input: {
    outcomes: SignalApplication[];
    sessionId: string;
    stream?: TurnAnswerOptions;
    show: ShowTemplateRow;
    stageKey: string;
    turnId: string;
    user: UserRecord;
  },
): Promise<void> {
  const significant = input.outcomes
    .filter(
      (outcome) =>
        outcome.previousLightState !== outcome.nextLightState ||
        outcome.dealbreakerHits > 0 ||
        outcome.positiveHits > 0 ||
        outcome.negativeHits > 0,
    )
    .slice(0, 4);

  for (const outcome of significant) {
    const content = reactionLine(outcome);
    await emitTextDelta(input.stream, content, {
      speakerKey: outcome.characterKey,
      speakerName: outcome.name,
    });
    await insertShowEvent(env, {
      appKey: input.show.app_key,
      content,
      data: {
        lightState: outcome.nextLightState,
        publicChange:
          outcome.previousLightState === outcome.nextLightState ? "reaction" : `${outcome.previousLightState}_to_${outcome.nextLightState}`,
      },
      eventType: reactionEventType(outcome),
      sessionId: input.sessionId,
      showKey: input.show.show_key,
      speakerKey: outcome.characterKey,
      speakerName: outcome.name,
      stageKey: input.stageKey,
      turnId: input.turnId,
      userId: input.user.id,
    });
  }

  const summary = await visibleRoomSummary(env, input.show, input.sessionId, input.user);
  const summaryContent = significant.length ? summary : `The room stays curious. ${summary}`;
  await emitTextDelta(input.stream, summaryContent, {
    speakerKey: "host",
    speakerName: "Host",
  });
  await insertShowEvent(env, {
    appKey: input.show.app_key,
    content: summaryContent,
    eventType: "host_summary",
    sessionId: input.sessionId,
    showKey: input.show.show_key,
    speakerKey: "host",
    speakerName: "Host",
    stageKey: input.stageKey,
    turnId: input.turnId,
    userId: input.user.id,
  });
}

async function completeIfNoLights(
  env: ShowEngineEnv,
  show: ShowTemplateRow,
  sessionId: string,
  user: UserRecord,
): Promise<boolean> {
  const guests = (await getSessionCharacters(env, show, sessionId, user)).filter(
    (character) => character.role === "guest",
  );
  const available = guests.filter((guest) => guest.light_state !== "off" && guest.is_available === 1);
  if (available.length > 0) {
    return false;
  }

  const summary =
    "All lights are off. The host ends the episode early: no forced chemistry, no empty finale, just a clean exit.";
  await env.DB.prepare(
    `UPDATE show_sessions
     SET current_stage_key = ?, status = ?, result_summary = ?, match_success = ?, points_awarded = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  )
    .bind("completed", "completed", summary, 0, 0, sessionId, user.id)
    .run();

  await insertMessage(env, {
    appKey: show.app_key,
    content: summary,
    role: "host",
    sessionId,
    showKey: show.show_key,
    speakerKey: "host",
    speakerName: "Host",
    stageKey: "completed",
    userId: user.id,
  });
  await insertShowEvent(env, {
    appKey: show.app_key,
    content: summary,
    eventType: "host_summary",
    sessionId,
    showKey: show.show_key,
    speakerKey: "host",
    speakerName: "Host",
    stageKey: "completed",
    userId: user.id,
  });

  return true;
}

async function applySignalsToGuests(
  env: ShowEngineEnv,
  input: {
    multiplier: number;
    session: ShowSessionRow;
    sessionId: string;
    signals: SignalExtraction;
    user: UserRecord;
  },
): Promise<SignalApplication[]> {
  const guests = await env.DB.prepare(
    `SELECT character_key, name, snapshot, affinity_score, is_available, light_state,
            dealbreaker_triggered, strong_signal_count
     FROM show_session_characters
     WHERE session_id = ? AND user_id = ? AND role = ?`,
  )
    .bind(input.sessionId, input.user.id, "guest")
    .all<SessionCharacterRow>();
  const outcomes: SignalApplication[] = [];

  for (const guest of guests.results) {
    if (guest.light_state === "off") {
      continue;
    }

    const snapshot = parseSnapshot(guest.snapshot) as CharacterSnapshot;
    const outcome = applySignalsToGuest(
      {
        affinityScore: guest.affinity_score,
        blowUpSignals: asStringArray(snapshot.blowUpSignals),
        characterKey: guest.character_key,
        dealbreakerSignals: asStringArray(snapshot.dealbreakerSignals),
        dealbreakerTriggered: guest.dealbreaker_triggered === 1,
        lightState: guest.light_state,
        name: guest.name,
        negativeSignals: asStringArray(snapshot.negativeSignals),
        positiveSignals: asStringArray(snapshot.positiveSignals),
        strongSignalCount: guest.strong_signal_count,
      },
      input.signals,
      input.multiplier,
    );
    if (!outcome) {
      continue;
    }
    outcomes.push(outcome);

    await env.DB.prepare(
      `UPDATE show_session_characters
       SET affinity_score = ?,
           is_available = ?,
           light_state = ?,
           dealbreaker_triggered = ?,
           strong_signal_count = ?
       WHERE session_id = ? AND user_id = ? AND character_key = ?`,
    )
      .bind(
        outcome.nextAffinity,
        outcome.nextLightState === "off" ? 0 : 1,
        outcome.nextLightState,
        outcome.dealbreakerTriggered ? 1 : 0,
        outcome.nextStrongSignalCount,
        input.sessionId,
        input.user.id,
        guest.character_key,
      )
      .run();
  }

  return outcomes;
}

async function applySemanticJudgmentToGuests(
  env: ShowEngineEnv,
  input: {
    judgment: SemanticTurnJudgment;
    multiplier: number;
    session: ShowSessionRow;
    sessionId: string;
    user: UserRecord;
  },
): Promise<SignalApplication[]> {
  const guests = await env.DB.prepare(
    `SELECT character_key, name, snapshot, affinity_score, is_available, light_state,
            dealbreaker_triggered, strong_signal_count
     FROM show_session_characters
     WHERE session_id = ? AND user_id = ? AND role = ?`,
  )
    .bind(input.sessionId, input.user.id, "guest")
    .all<SessionCharacterRow>();
  const judgmentsByKey = new Map(input.judgment.guestJudgments.map((judgment) => [judgment.characterKey, judgment]));
  const outcomes: SignalApplication[] = [];

  for (const guest of guests.results) {
    if (guest.light_state === "off") {
      continue;
    }

    const judgment = judgmentsByKey.get(guest.character_key);
    if (!judgment) {
      continue;
    }

    const snapshot = parseSnapshot(guest.snapshot) as CharacterSnapshot;
    const positiveHits = countOverlap(judgment.attractionTags, asStringArray(snapshot.positiveSignals));
    const negativeHits = countOverlap(judgment.riskTags, asStringArray(snapshot.negativeSignals));
    const dealbreakerHits = countOverlap(judgment.riskTags, asStringArray(snapshot.dealbreakerSignals));
    const blowUpHits = countOverlap(judgment.attractionTags, asStringArray(snapshot.blowUpSignals));
    const delta = clamp(Math.round(judgment.delta * input.multiplier), -45, 28);
    const nextAffinity = clamp(guest.affinity_score + delta, 0, 100);
    const nextStrongSignalCount = guest.strong_signal_count + blowUpHits;
    const dealbreakerTriggered = guest.dealbreaker_triggered === 1 || dealbreakerHits > 0 || delta <= -35;
    const nextLightState = semanticNextLightState({
      dealbreakerTriggered,
      nextAffinity,
      nextStrongSignalCount,
    });
    const outcome: SignalApplication = {
      attractionTags: judgment.attractionTags,
      characterKey: guest.character_key,
      dealbreakerHits,
      dealbreakerTriggered,
      delta,
      name: guest.name,
      negativeHits,
      nextAffinity,
      nextLightState,
      nextStrongSignalCount,
      positiveHits,
      previousLightState: guest.light_state,
      reason: judgment.reason,
      riskTags: judgment.riskTags,
    };
    outcomes.push(outcome);

    await env.DB.prepare(
      `UPDATE show_session_characters
       SET affinity_score = ?,
           is_available = ?,
           light_state = ?,
           dealbreaker_triggered = ?,
           strong_signal_count = ?
       WHERE session_id = ? AND user_id = ? AND character_key = ?`,
    )
      .bind(
        outcome.nextAffinity,
        outcome.nextLightState === "off" ? 0 : 1,
        outcome.nextLightState,
        outcome.dealbreakerTriggered ? 1 : 0,
        outcome.nextStrongSignalCount,
        input.sessionId,
        input.user.id,
        guest.character_key,
      )
      .run();
  }

  return outcomes;
}

async function insertSemanticJudgmentEvent(
  env: ShowEngineEnv,
  input: {
    judgment: SemanticTurnJudgment;
    outcomes: SignalApplication[];
    sessionId: string;
    show: ShowTemplateRow;
    stageKey: string;
    turnId: string;
    user: UserRecord;
  },
): Promise<void> {
  await insertShowEvent(env, {
    appKey: input.show.app_key,
    content: "The room reads the answer and each Guest's signal shifts.",
    data: {
      guestDeltas: input.outcomes.map((outcome) => serializeGuestDelta(outcome)),
      semanticResult: input.judgment,
    },
    eventType: "semantic_judgment",
    sessionId: input.sessionId,
    showKey: input.show.show_key,
    speakerKey: "host",
    speakerName: "Host",
    stageKey: input.stageKey,
    turnId: input.turnId,
    userId: input.user.id,
  });
}

async function emitGeneratedReactions(
  env: ShowEngineEnv,
  input: {
    answerText: string;
    currentSpeakerKey: string | null;
    focusCharacterKey: string | null;
    judgment: SemanticTurnJudgment;
    outcomes: SignalApplication[];
    session: ShowSessionRow;
    sessionId: string;
    show: ShowTemplateRow;
    stageKey: string;
    stream?: TurnAnswerOptions;
    turnId: string;
    user: UserRecord;
  },
): Promise<GeneratedReaction[]> {
  const characters = await getSessionCharacters(env, input.show, input.sessionId, input.user);
  const outcomeByKey = new Map(input.outcomes.map((outcome) => [outcome.characterKey, outcome]));
  const guests = characters.filter((character) => {
    if (character.role !== "guest") {
      return false;
    }

    const outcome = outcomeByKey.get(character.character_key);
    return (character.light_state !== "off" && character.is_available === 1) || outcome?.nextLightState === "off";
  });
  const selected = selectReactionGuests({
    currentSpeakerKey: input.currentSpeakerKey,
    focusCharacterKey: input.focusCharacterKey,
    guests,
    outcomes: input.outcomes,
  });
  const reactions: GeneratedReaction[] = [];

  for (const guest of selected) {
    const outcome = input.outcomes.find((item) => item.characterKey === guest.character_key);
    const text = await generateCharacterReactionLine(env, {
      answerText: input.answerText,
      guest,
      judgment: input.judgment,
      outcome,
      session: input.session,
      show: input.show,
      stageKey: input.stageKey,
      stream: input.stream,
    });
    reactions.push({
      characterKey: guest.character_key,
      reason: outcome?.reason ?? "Their signal shifted after the answer.",
      text,
    });

    await insertMessage(env, {
      appKey: input.show.app_key,
      content: text,
      role: "character",
      sessionId: input.sessionId,
      showKey: input.show.show_key,
      speakerKey: guest.character_key,
      speakerName: guest.name,
      stageKey: input.stageKey,
      userId: input.user.id,
    });
    await insertShowEvent(env, {
      appKey: input.show.app_key,
      content: text,
      data: {
        generatedReaction: true,
        reason: outcome?.reason ?? null,
        semanticSource: input.judgment.source,
      },
      eventType: "guest_reaction",
      sessionId: input.sessionId,
      showKey: input.show.show_key,
      speakerKey: guest.character_key,
      speakerName: guest.name,
      stageKey: input.stageKey,
      turnId: input.turnId,
      userId: input.user.id,
    });
  }

  return reactions;
}

async function generateGuestQuestion(
  env: ShowEngineEnv,
  input: {
    guest: SessionCharacterRow;
    recentMessages: ShowMessageRow[];
    session: ShowSessionRow;
    show: ShowTemplateRow;
    stageKey: string;
    stream?: TurnAnswerOptions;
  },
): Promise<string> {
  const snapshot = parseSnapshot(input.guest.snapshot) as CharacterSnapshot;
  const profileSummary = sessionIdentitySummary(input.session.user_profile);
  const history = input.recentMessages
    .slice(-4)
    .map((m) => `${m.speaker_name}: ${m.content}`)
    .join("\n");
  const fallbackText = `${input.guest.name}: What is something about you that a first impression usually gets wrong?`;

  const result = await generateText(env, {
    fallbackText,
    maxOutputTokens: 80,
    messages: [
      {
        content: [
          `You are ${input.guest.name}, a guest on a live dating show.`,
          `Your personality: ${snapshot.personality}`,
          `Your goal: ${snapshot.goal}`,
          `Speaking style: ${snapshot.speakingStyle}`,
          `Hidden preferences: ${snapshot.hiddenPreferences}`,
          "",
          `The contestant's background: ${profileSummary}`,
          "",
          `Recent conversation:\n${history || "(none yet)"}`,
          "",
          "Ask ONE natural, specific question directly to the contestant.",
          `Start with "${input.guest.name}:" — under 40 words, first person.`,
          "Reference their actual job, hobbies, or age range if possible. No generic questions.",
        ].join("\n"),
        role: "user",
      },
    ],
    metadata: {
      appKey: input.session.app_key,
      purpose: "guest_question_generation",
      sessionId: input.session.id,
      showKey: input.show.show_key,
      stageKey: input.stageKey,
      userId: input.session.user_id,
    },
    onDelta: input.stream?.onDelta
      ? (text) => input.stream?.onDelta?.(text, { speakerKey: input.guest.character_key, speakerName: input.guest.name })
      : undefined,
    route: "cheap-dialogue",
    stream: input.stream?.stream,
    temperature: 0.75,
  });

  return sanitizeGeneratedLine(normalizeShortText(result.text, fallbackText, 320), fallbackText, input.guest.name);
}

async function generateGuestAnswer(
  env: ShowEngineEnv,
  input: {
    guest: SessionCharacterRow;
    session: ShowSessionRow;
    show: ShowTemplateRow;
    stageKey: string;
    stream?: TurnAnswerOptions;
    userQuestion: string;
  },
): Promise<string> {
  const snapshot = parseSnapshot(input.guest.snapshot) as CharacterSnapshot;
  const profileSummary = sessionIdentitySummary(input.session.user_profile);
  const fallbackText = `${input.guest.name}: That is a fair question. Let me think about it for a moment.`;

  const result = await generateText(env, {
    fallbackText,
    maxOutputTokens: 120,
    messages: [
      {
        content: [
          `You are ${input.guest.name}, a guest on a live dating show.`,
          `Your personality: ${snapshot.personality}`,
          `Your goal: ${snapshot.goal}`,
          `Speaking style: ${snapshot.speakingStyle}`,
          `Hidden preferences: ${snapshot.hiddenPreferences}`,
          `Boundaries: ${snapshot.boundaries}`,
          `Current affinity: ${input.guest.affinity_score}`,
          "",
          `Contestant background: ${profileSummary}`,
          "",
          `The contestant asked you: "${input.userQuestion}"`,
          "",
          `Answer in character — under 50 words, first person. Start with "${input.guest.name}:".`,
          "Be honest and specific. Show your personality. PG-13.",
        ].join("\n"),
        role: "user",
      },
    ],
    metadata: {
      appKey: input.session.app_key,
      purpose: "guest_answer_generation",
      sessionId: input.session.id,
      showKey: input.show.show_key,
      stageKey: input.stageKey,
      userId: input.session.user_id,
    },
    onDelta: input.stream?.onDelta
      ? (text) => input.stream?.onDelta?.(text, { speakerKey: input.guest.character_key, speakerName: input.guest.name })
      : undefined,
    route: "cheap-dialogue",
    stream: input.stream?.stream,
    temperature: 0.72,
  });

  return sanitizeGeneratedLine(normalizeShortText(result.text, fallbackText, 400), fallbackText, input.guest.name);
}

async function generateCharacterReactionLine(
  env: ShowEngineEnv,
  input: {
    answerText: string;
    guest: SessionCharacterRow;
    judgment: SemanticTurnJudgment;
    outcome?: SignalApplication;
    session: ShowSessionRow;
    show: ShowTemplateRow;
    stageKey: string;
    stream?: TurnAnswerOptions;
  },
): Promise<string> {
  const snapshot = parseSnapshot(input.guest.snapshot) as CharacterSnapshot;
  const fallbackText = fallbackCharacterReactionLine(input.guest.name, input.outcome);
  const result = await generateText(env, {
    fallbackText,
    maxOutputTokens: 120,
    messages: [
      {
        content: [
          "You write one natural spoken line for a Guest in an interactive companion story.",
          "Use only this Guest's voice and current state.",
          "Do not change scores, lights, or rules.",
          "No narration, no speaker prefix, no parentheses, no stage directions.",
          "PG-13, concise, emotionally specific.",
        ].join(" "),
        role: "system",
      },
      {
        content: [
          `Guest: ${input.guest.name}`,
          `Personality: ${snapshot.personality}`,
          `Goal: ${snapshot.goal}`,
          `Boundaries: ${snapshot.boundaries}`,
          `Hidden preferences: ${snapshot.hiddenPreferences}`,
          `Speaking style: ${snapshot.speakingStyle}`,
          `Stage: ${input.stageKey}`,
          `Current affinity after judgment: ${input.outcome?.nextAffinity ?? input.guest.affinity_score}`,
          `Light state after judgment: ${input.outcome?.nextLightState ?? input.guest.light_state}`,
          `Why their state changed: ${input.outcome?.reason ?? "The answer did not move them much."}`,
          `User answer: ${input.answerText}`,
          "Write one spoken reaction under 36 words. If positive, show what landed. If cautious, name the concern kindly. If light is off, make the boundary clear.",
        ].join("\n"),
        role: "user",
      },
    ],
    metadata: {
      appKey: input.session.app_key,
      purpose: "show_guest_reaction",
      sessionId: input.session.id,
      showKey: input.show.show_key,
      stageKey: input.stageKey,
      userId: input.session.user_id,
    },
    onDelta: input.stream?.onDelta
      ? (text) => input.stream?.onDelta?.(text, {
        speakerKey: input.guest.character_key,
        speakerName: input.guest.name,
      })
      : undefined,
    route: "cheap-dialogue",
    stream: input.stream?.stream,
    temperature: 0.72,
  });

  return sanitizeGeneratedLine(normalizeShortText(result.text, fallbackText, 320), fallbackText, input.guest.name);
}

function selectReactionGuests(input: {
  currentSpeakerKey: string | null;
  focusCharacterKey: string | null;
  guests: SessionCharacterRow[];
  outcomes: SignalApplication[];
}): SessionCharacterRow[] {
  const byKey = new Map(input.guests.map((guest) => [guest.character_key, guest]));
  const orderedKeys = [
    input.focusCharacterKey,
    input.currentSpeakerKey,
    ...[...input.outcomes]
      .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
      .map((outcome) => outcome.characterKey),
  ].filter((key): key is string => Boolean(key));
  const selected: SessionCharacterRow[] = [];
  const seen = new Set<string>();
  for (const key of orderedKeys) {
    const guest = byKey.get(key);
    if (!guest || seen.has(key)) {
      continue;
    }

    selected.push(guest);
    seen.add(key);
    if (selected.length >= 2) {
      break;
    }
  }

  return selected.length ? selected : input.guests.slice(0, 1);
}

function fallbackCharacterReactionLine(_name: string, outcome?: SignalApplication): string {
  if (!outcome) {
    return "I am still listening. I need to hear a little more before my signal changes.";
  }

  if (outcome.nextLightState === "off") {
    return "I have to be honest, that crosses a boundary for me, so I am turning my light off.";
  }

  if (outcome.delta > 0) {
    return `That part lands with me. ${outcome.reason ?? "It feels more real than a polished answer."}`;
  }

  if (outcome.delta < 0) {
    return `I am more cautious now. ${outcome.reason ?? "I need more care and clarity from you."}`;
  }

  return "I am still curious, but I need a more personal answer before I move closer.";
}

function serializeGuestDelta(outcome: SignalApplication) {
  return {
    attractionTags: outcome.attractionTags ?? [],
    characterKey: outcome.characterKey,
    delta: outcome.delta,
    lightState: outcome.nextLightState,
    nextAffinity: outcome.nextAffinity,
    reason: outcome.reason ?? reactionLine(outcome),
    riskTags: outcome.riskTags ?? [],
  };
}

function semanticNextLightState(input: {
  dealbreakerTriggered: boolean;
  nextAffinity: number;
  nextStrongSignalCount: number;
}): SessionCharacterRow["light_state"] {
  if (input.dealbreakerTriggered || input.nextAffinity <= 15) {
    return "off";
  }

  if (input.nextAffinity >= 85 || input.nextStrongSignalCount >= 3) {
    return "blow_up";
  }

  return "on";
}

async function visibleRoomSummary(
  env: ShowEngineEnv,
  show: ShowTemplateRow,
  sessionId: string,
  user: UserRecord,
): Promise<string> {
  const guests = (await getSessionCharacters(env, show, sessionId, user)).filter(
    (character) => character.role === "guest",
  );
  const onCount = guests.filter((guest) => guest.light_state === "on").length;
  const offCount = guests.filter((guest) => guest.light_state === "off").length;
  const blowUpNames = guests.filter((guest) => guest.light_state === "blow_up").map((guest) => guest.name);
  const blowUpText = blowUpNames.length ? `${blowUpNames.join(", ")} blows up.` : "No one blows up yet.";

  return `${onCount} lights stay on, ${offCount} lights turn off. ${blowUpText}`;
}

function chooseActiveGuest(guests: SessionCharacterRow[]): SessionCharacterRow | undefined {
  return [...guests]
    .filter((guest) => guest.light_state !== "off" && guest.is_available === 1)
    .sort((left, right) => right.affinity_score - left.affinity_score)[0];
}

type SignalExtraction = {
  dealbreakerSignals: string[];
  negativeSignals: string[];
  positiveSignals: string[];
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function findStage(stages: ShowStageRow[], stageKey: string): ShowStageRow | undefined {
  return stages.find((stage) => stage.stage_key === stageKey);
}

function nextStageForMessageCount(stages: ShowStageRow[], count: number): ShowStageRow {
  const eligibleStages = stages
    .filter((stage) => stage.is_final !== 1 && stage.auto_advance_after_messages !== null)
    .filter((stage) => count >= Number(stage.auto_advance_after_messages))
    .sort((left, right) => right.stage_order - left.stage_order);

  return eligibleStages[0] ?? stages[0] ?? fallbackStage();
}

function fallbackStage(): ShowStageRow {
  return {
    allowed_user_actions: "[]",
    auto_advance_after_messages: null,
    goal: "Keep the show moving.",
    host_instruction: "Respond in format.",
    is_final: 0,
    stage_key: "interaction",
    stage_order: 0,
    title: "Interaction",
  };
}

function calculateAffinityDelta(content: string): number {
  const lower = content.toLowerCase();
  let delta = 3;

  for (const positive of ["honest", "kind", "curious", "fun", "love", "creative", "family"]) {
    if (lower.includes(positive)) {
      delta += 2;
    }
  }

  for (const negative of ["hate", "boring", "stupid", "whatever", "rich only"]) {
    if (lower.includes(negative)) {
      delta -= 5;
    }
  }

  return delta;
}

function normalizeAudiencePreference(value: string | undefined): AudiencePreference {
  return value === "male" || value === "female" || value === "any" ? value : "any";
}

function normalizeShortText(value: string | undefined, fallback: string, maxLength: number): string {
  const normalized = value?.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return fallback;
  }

  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function normalizeObjectKey(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || normalized.length > 512) {
    return null;
  }

  return normalized;
}

function normalizeCharacterKeyValue(value: string | undefined): string {
  const normalized = normalizeShortText(value, "", 120);
  return normalized ? slugify(normalized) : "";
}

function splitUserList(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}
function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "character";
}

function readFreeMessageLimit(env: ShowEngineEnv, show: ShowTemplateRow): number {
  const config = readJsonObject(show.config);
  const configured = typeof config.freeMessageLimit === "number" ? config.freeMessageLimit : undefined;
  const envValue = Number(env.AI_TV_DATING_FREE_MESSAGE_LIMIT);
  const parsed = Number.isFinite(envValue) && envValue > 0 ? envValue : configured;

  return parsed && parsed > 0 ? parsed : DEFAULT_FREE_MESSAGE_LIMIT;
}

function readJsonArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function readJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function parseSnapshot(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return { raw: value };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
