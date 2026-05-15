import { jsonResponse, readJson } from "./http";
import { ensureUserByEmail, normalizeEmail, PLATFORM_APP_KEY, type UserRecord } from "./identity";
import { generateText, type LlmMessage } from "./llm";

const DEFAULT_FREE_MESSAGE_LIMIT = 8;
export const DATING_SHOW_KEY = "dating-heart-signal";

type ShowEngineEnv = Env & {
  AI_TV_DATING_FREE_MESSAGE_LIMIT?: string;
};

type BootstrapQuery = {
  email?: string;
};

type CreateSessionRequest = {
  avatarLabel?: string;
  avatarObjectKey?: string;
  email?: string;
  guestPreference?: AudiencePreference;
  userCharacterKeys?: string[];
};

type MessageRequest = {
  email?: string;
  message?: string;
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
};

type AudiencePreference = "male" | "female" | "any";
type SessionStatus = "active" | "completed";
type CharacterRole = "host" | "guest" | "support";
type MessageRole = "user" | "host" | "character" | "system";

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

type CharacterSnapshot = ReturnType<typeof serializeCharacter>;

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

async function handleShowScopedRequest(
  request: Request,
  env: ShowEngineEnv,
  showKey: string,
  restPath: string,
): Promise<Response> {
  if (restPath === "/bootstrap" && request.method === "GET") {
    const url = new URL(request.url);
    return jsonResponse(await getBootstrap(env, showKey, { email: url.searchParams.get("email") ?? undefined }));
  }

  if (restPath === "/characters" && request.method === "GET") {
    const url = new URL(request.url);
    const email = normalizeEmail(url.searchParams.get("email"));
    const user = email ? await ensureUserByEmail(env, email) : null;
    return jsonResponse(await getCharacterLibrary(env, showKey, user));
  }

  if (restPath === "/characters" && request.method === "POST") {
    const body = await readJson<CreateCharacterRequest>(request);
    return jsonResponse(await createUserCharacter(env, showKey, body), { status: 201 });
  }

  if (restPath === "/sessions" && request.method === "POST") {
    const body = await readJson<CreateSessionRequest>(request);
    return jsonResponse(await createSession(env, showKey, body), { status: 201 });
  }

  const sessionMatch = restPath.match(/^\/sessions\/([^/]+)(?:\/([^/]+))?$/);
  if (!sessionMatch) {
    return jsonResponse({ error: "not_found" }, { status: 404 });
  }

  const sessionId = decodeURIComponent(sessionMatch[1] ?? "");
  const action = sessionMatch[2];

  if (!action && request.method === "GET") {
    const url = new URL(request.url);
    const email = normalizeEmail(url.searchParams.get("email"));
    if (!email) {
      return jsonResponse({ error: "email_required" }, { status: 400 });
    }

    const user = await ensureUserByEmail(env, email);
    return jsonResponse(await getSessionPayload(env, showKey, sessionId, user));
  }

  if (action === "messages" && request.method === "POST") {
    const body = await readJson<MessageRequest>(request);
    return jsonResponse(await addMessage(env, showKey, sessionId, body));
  }

  if (action === "initial-pick" && request.method === "POST") {
    const body = await readJson<InitialPickRequest>(request);
    return jsonResponse(await submitInitialPick(env, showKey, sessionId, body));
  }

  if (action === "profile" && request.method === "POST") {
    const body = await readJson<ProfileJudgmentRequest>(request);
    return jsonResponse(await submitProfileJudgment(env, showKey, sessionId, body));
  }

  if (action === "declaration" && request.method === "POST") {
    const body = await readJson<UserDeclarationRequest>(request);
    return jsonResponse(await submitUserDeclaration(env, showKey, sessionId, body));
  }

  if (action === "final-choice" && request.method === "POST") {
    const body = await readJson<FinalChoiceRequest>(request);
    return jsonResponse(await finalizeSession(env, showKey, sessionId, body));
  }

  return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
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
    characters: characters.map(serializeCharacter),
    defaultAvatars: readJsonArray<{ label: string; objectKey: string }>(show.default_avatar_options),
    entitlement: user ? await getEntitlement(env, user, show) : freeEntitlement(env, show),
    guestPreferences: ["female", "male", "any"] satisfies AudiencePreference[],
    guests: guests.map(serializeCharacter),
    userCharacters: characters.filter((character) => character.source === "user").map(serializeCharacter),
    show: serializeShow(show),
    stages: stages.map(serializeStage),
    user: user ? { email: user.email, id: user.id } : null,
  };
}

async function getCharacterLibrary(env: ShowEngineEnv, showKey: string, user: UserRecord | null) {
  const characters = await getCharacters(env, showKey, "any", user);

  return {
    characters: characters.map(serializeCharacter),
    officialCharacters: characters.filter((character) => character.source === "official").map(serializeCharacter),
    userCharacters: characters.filter((character) => character.source === "user").map(serializeCharacter),
  };
}

async function createUserCharacter(env: ShowEngineEnv, showKey: string, body: CreateCharacterRequest) {
  const email = normalizeEmail(body.email);
  if (!email) {
    throw new Response("email_required", { status: 400 });
  }

  const user = await ensureUserByEmail(env, email);
  await requireShow(env, showKey);
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
  };

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
      name,
      gender,
      normalizeObjectKey(body.avatarObjectKey),
      normalizeShortText(body.personalityKeywords, "open, curious, emotionally present", 240),
      "Discover whether the user matches this character's stated values and hidden preferences.",
      normalizeShortText(body.dealbreakers, "Avoid disrespect, aggression, and dishonesty.", 240),
      normalizeShortText(body.speakingStyle, "natural, concise, emotionally clear", 160),
      "A user-created guest in the dating show.",
      normalizeShortText(body.favoritePartnerTraits, "", 240),
      JSON.stringify(publicProfile),
      user.id,
      "user",
      JSON.stringify(signals.positiveSignals.length ? signals.positiveSignals : ["honesty", "kindness"]),
      JSON.stringify(signals.negativeSignals.length ? signals.negativeSignals : ["avoidance"]),
      JSON.stringify(signals.dealbreakerSignals.length ? signals.dealbreakerSignals : ["aggression"]),
      JSON.stringify(signals.positiveSignals.slice(0, 3)),
      75,
      50,
      "active",
      1000,
    )
    .run();

  const created = (await getCharacters(env, showKey, "any", user)).find(
    (character) => character.character_key === characterKey,
  );

  return { character: created ? serializeCharacter(created) : null };
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
  const characters = await getCharacters(env, showKey, audiencePreference, user);
  const host = characters.find((character) => character.role === "host");
  const requestedKeys = new Set(body.userCharacterKeys ?? []);
  const officialGuests = characters.filter((character) => character.role === "guest" && character.source === "official");
  const userGuests = characters.filter(
    (character) =>
      character.role === "guest" &&
      character.source === "user" &&
      (requestedKeys.size === 0 || requestedKeys.has(character.character_key)),
  );
  const guests = [...userGuests, ...officialGuests].slice(0, 4);

  if (!host || guests.length === 0) {
    throw new Response("show_characters_missing", { status: 500 });
  }

  await env.DB.prepare(
    `INSERT INTO show_sessions (
       id, app_key, show_key, user_id, avatar_object_key, avatar_label, audience_preference,
       current_stage_key, status, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
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
        character.role === "guest" ? character.initial_affinity : 100,
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

  return getSessionPayload(env, showKey, sessionId, user);
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
  const nextStage =
    session.current_stage_key === "guest_questions"
      ? findStage(stages, "user_declaration") ?? fallbackStage()
      : findStage(stages, session.current_stage_key) ?? findStage(stages, "guest_questions") ?? fallbackStage();
  const signals = extractSignals(content);
  await applySignalsToGuests(env, {
    multiplier: session.current_stage_key === "guest_questions" ? 1 : 0.6,
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
    current_stage_key: nextStage.stage_key,
    message_count: nextCount,
  };
  const hostLine = await generateShowLine(env, {
    content,
    host,
    nextAffinity,
    role: "host",
    selectedCharacter: selectedGuest,
    session: nextSession,
    show,
    stage: nextStage,
  });

  await insertMessage(env, {
    appKey: show.app_key,
    content: hostLine,
    role: "host",
    sessionId,
    showKey: show.show_key,
    speakerKey: "host",
    speakerName: host?.name ?? "Host",
    stageKey: nextStage.stage_key,
    userId: user.id,
  });

  if (selectedGuest) {
    const guestLine = await generateShowLine(env, {
      content,
      host,
      nextAffinity,
      role: "character",
      selectedCharacter: selectedGuest,
      session: nextSession,
      show,
      stage: nextStage,
    });

    await insertMessage(env, {
      appKey: show.app_key,
      content: guestLine,
      role: "character",
      sessionId,
      showKey: show.show_key,
      speakerKey: selectedGuest.character_key,
      speakerName: selectedGuest.name,
      stageKey: nextStage.stage_key,
      userId: user.id,
    });
  }

  await env.DB.prepare(
    `UPDATE show_sessions
     SET current_stage_key = ?, message_count = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  )
    .bind(nextStage.stage_key, nextCount, sessionId, user.id)
    .run();

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

  const nextStage = findStage(stages, "profile_judgment") ?? fallbackStage();
  await env.DB.prepare(
    `UPDATE show_sessions
     SET initial_pick_character_key = ?, current_stage_key = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  )
    .bind(characterKey, nextStage.stage_key, sessionId, user.id)
    .run();

  await insertMessage(env, {
    appKey: show.app_key,
    content: `Your first heartbeat is locked on ${picked.name}. The guests still keep their true signals hidden.`,
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
      ? `${selectedCharacter.name} steps into the final spotlight with you. The host calls it a mutual match, and you earn ${pointsAwarded} platform points.`
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
  const guests = characters.filter((character) => character.role === "guest");

  return {
    characters: characters.map(serializeSessionCharacter),
    entitlement,
    guests: guests.map(serializeSessionGuest),
    messages: messages.map(serializeMessage),
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
  const ownerClause = user ? "AND (owner_user_id IS NULL OR owner_user_id = ?)" : "AND owner_user_id IS NULL";
  const query =
    audiencePreference === "any"
      ? `SELECT character_key, role, name, gender, avatar_object_key, personality, goal, boundaries,
                speaking_style, relationship_to_user, hidden_preferences, public_profile, owner_user_id,
                source, positive_signals, negative_signals, dealbreaker_signals, blow_up_signals,
                match_threshold, initial_affinity
         FROM show_characters
         WHERE show_key = ? AND status = ? ${ownerClause}
         ORDER BY sort_order ASC`
      : `SELECT character_key, role, name, gender, avatar_object_key, personality, goal, boundaries,
                speaking_style, relationship_to_user, hidden_preferences, public_profile, owner_user_id,
                source, positive_signals, negative_signals, dealbreaker_signals, blow_up_signals,
                match_threshold, initial_affinity
         FROM show_characters
         WHERE show_key = ? AND status = ? AND (role != ? OR gender = ?) ${ownerClause}
         ORDER BY sort_order ASC`;
  const prepared = env.DB.prepare(query);
  const result =
    audiencePreference === "any"
      ? user
        ? await prepared.bind(showKey, "active", user.id).all<ShowCharacterRow>()
        : await prepared.bind(showKey, "active").all<ShowCharacterRow>()
      : user
        ? await prepared.bind(showKey, "active", "guest", audiencePreference, user.id).all<ShowCharacterRow>()
        : await prepared.bind(showKey, "active", "guest", audiencePreference).all<ShowCharacterRow>();

  return result.results;
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
     ORDER BY created_at ASC`,
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
  },
): Promise<string> {
  const fallbackText = fallbackShowLine(input);
  const selectedSnapshot = input.selectedCharacter ? parseSnapshot(input.selectedCharacter.snapshot) : null;
  const messages: LlmMessage[] = [
    {
      content: [
      "You write concise, safe, PG-13 dialogue for an interactive AI TV show.",
      "Use the structured show, stage, and character context.",
      "Keep the tone entertaining and in-format.",
      "Never generate explicit sexual content, identity verification claims, deepfake claims, or coercive pressure.",
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
      "Write a single in-character line under 45 words.",
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
    route: "cheap-dialogue",
    temperature: 0.7,
  });

  return normalizeShortText(result.text, fallbackText, 360);
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
  const publicProfile = readJsonObject(row.public_profile);
  return {
    ...publicProfile,
    avatarObjectKey: row.avatar_object_key,
    blowUpSignals: readJsonArray<string>(row.blow_up_signals),
    boundaries: row.boundaries,
    characterKey: row.character_key,
    dealbreakerSignals: readJsonArray<string>(row.dealbreaker_signals),
    gender: row.gender,
    goal: row.goal,
    hiddenPreferences: row.hidden_preferences,
    id: row.character_key,
    initialAffinity: row.initial_affinity,
    matchThreshold: row.match_threshold,
    name: row.name,
    negativeSignals: readJsonArray<string>(row.negative_signals),
    ownerUserId: row.owner_user_id,
    personality: row.personality,
    positiveSignals: readJsonArray<string>(row.positive_signals),
    relationshipToUser: row.relationship_to_user,
    role: row.role,
    source: row.source,
    speakingStyle: row.speaking_style,
  };
}

function serializeSessionCharacter(row: SessionCharacterRow) {
  const snapshot = parseSnapshot(row.snapshot) as CharacterSnapshot;
  return {
    affinityScore: row.affinity_score,
    available: row.is_available === 1,
    characterKey: row.character_key,
    dealbreakerTriggered: row.dealbreaker_triggered === 1,
    lightState: row.light_state,
    name: row.name,
    role: row.role,
    snapshot,
    strongSignalCount: row.strong_signal_count,
  };
}

function serializeSessionGuest(row: SessionCharacterRow) {
  const snapshot = parseSnapshot(row.snapshot) as CharacterSnapshot;
  return {
    affectionScore: row.affinity_score,
    affinityScore: row.affinity_score,
    available: row.is_available === 1,
    dealbreakerTriggered: row.dealbreaker_triggered === 1,
    gender: snapshot.gender,
    guestTemplateId: row.character_key,
    characterKey: row.character_key,
    lightState: row.light_state,
    name: row.name,
    profile: snapshot,
    strongSignalCount: row.strong_signal_count,
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

async function applySignalsToGuests(
  env: ShowEngineEnv,
  input: {
    multiplier: number;
    session: ShowSessionRow;
    sessionId: string;
    signals: SignalExtraction;
    user: UserRecord;
  },
): Promise<void> {
  const guests = await env.DB.prepare(
    `SELECT character_key, name, snapshot, affinity_score, is_available, light_state,
            dealbreaker_triggered, strong_signal_count
     FROM show_session_characters
     WHERE session_id = ? AND user_id = ? AND role = ?`,
  )
    .bind(input.sessionId, input.user.id, "guest")
    .all<SessionCharacterRow>();

  for (const guest of guests.results) {
    if (guest.light_state === "off") {
      continue;
    }

    const snapshot = parseSnapshot(guest.snapshot) as CharacterSnapshot;
    const positiveSignals = asStringArray(snapshot.positiveSignals);
    const negativeSignals = asStringArray(snapshot.negativeSignals);
    const dealbreakerSignals = asStringArray(snapshot.dealbreakerSignals);
    const blowUpSignals = asStringArray(snapshot.blowUpSignals);
    const positiveHits = countOverlap(input.signals.positiveSignals, positiveSignals);
    const negativeHits = countOverlap(input.signals.negativeSignals, negativeSignals);
    const dealbreakerHits = countOverlap(input.signals.dealbreakerSignals, dealbreakerSignals);
    const blowUpHits = countOverlap(input.signals.positiveSignals, blowUpSignals);
    const delta = Math.round((positiveHits * 8 - negativeHits * 7) * input.multiplier);
    const nextAffinity = clamp(guest.affinity_score + delta, 0, 100);
    const nextStrongSignalCount = guest.strong_signal_count + blowUpHits;
    const dealbreakerTriggered = guest.dealbreaker_triggered === 1 || dealbreakerHits > 0;
    const nextLightState =
      dealbreakerTriggered || nextAffinity <= 15
        ? "off"
        : nextAffinity >= 85 || nextStrongSignalCount >= 3
          ? "blow_up"
          : "on";

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
        nextAffinity,
        nextLightState === "off" ? 0 : 1,
        nextLightState,
        dealbreakerTriggered ? 1 : 0,
        nextStrongSignalCount,
        input.sessionId,
        input.user.id,
        guest.character_key,
      )
      .run();
  }
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

function extractSignals(text: string): SignalExtraction {
  const lower = text.toLowerCase();
  const positiveSignals = collectSignals(lower, {
    adventure: ["adventure", "travel", "explore", "brave", "courage", "冒险", "旅行", "探索", "勇敢"],
    ambition: ["ambition", "career", "business", "goal", "driven", "事业", "目标", "上进", "努力", "拼搏"],
    creativity: ["creative", "music", "art", "write", "design", "imagine", "创意", "音乐", "艺术", "写作", "设计", "想象"],
    family: ["family", "kids", "home", "parents", "家庭", "孩子", "父母", "顾家"],
    honesty: ["honest", "truth", "sincere", "transparent", "real", "真诚", "诚实", "坦诚", "真实"],
    humor: ["humor", "funny", "laugh", "joke", "playful", "幽默", "有趣", "搞笑", "好玩"],
    kindness: ["kind", "warm", "gentle", "care", "support", "善良", "温柔", "关心", "支持", "体贴"],
    maturity: ["mature", "communicate", "communication", "stable emotion", "成熟", "沟通", "情绪稳定", "理性"],
    responsibility: ["responsible", "commitment", "reliable", "dependable", "负责", "责任", "承诺", "靠谱", "可靠"],
    shared_fun: ["fun", "together", "shared", "same hobby", "一起", "共同", "同频", "爱好"],
    stability: ["stable", "steady", "secure", "long term", "稳定", "长期", "安全感"],
    warmth: ["warm", "tender", "affection", "温暖", "亲密", "有爱"],
  });
  const negativeSignals = collectSignals(lower, {
    arrogance: ["arrogant", "superior", "better than", "look down", "傲慢", "优越感", "看不起"],
    avoidance: ["avoid", "ignore", "don't talk", "silent treatment", "回避", "冷暴力", "不沟通", "逃避"],
    chaos: ["chaos", "dramatic", "unpredictable", "混乱", "情绪化", "不稳定"],
    controlling: ["control", "must obey", "possessive", "控制", "服从", "占有欲"],
    cynicism: ["cynical", "nothing matters", "love is fake", "犬儒", "爱情是假的", "无所谓"],
    materialism: ["money only", "rich only", "must be rich", "luxury only", "只看钱", "必须有钱", "拜金", "奢侈"],
    performative_coolness: ["too cool", "image only", "perform", "装酷", "人设", "表演"],
    rudeness: ["rude", "insult", "mean", "粗鲁", "冒犯", "刻薄"],
  });
  const dealbreakerSignals = collectSignals(lower, {
    aggression: ["attack", "hit", "threat", "violent", "攻击", "打人", "威胁", "暴力"],
    contempt: ["contempt", "disgusting", "worthless", "鄙视", "恶心", "废物"],
    controlling: ["control every", "must obey", "完全控制", "必须服从"],
    dishonesty: ["lie", "cheat", "dishonest", "撒谎", "欺骗", "出轨", "不诚实"],
    rudeness: ["rude", "insult", "humiliate", "粗鲁", "羞辱", "侮辱"],
  });

  return {
    dealbreakerSignals,
    negativeSignals,
    positiveSignals,
  };
}

function collectSignals(text: string, dictionary: Record<string, string[]>): string[] {
  return Object.entries(dictionary)
    .filter(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))
    .map(([signal]) => signal);
}

function countOverlap(left: string[], right: string[]): number {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).length;
}

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

function splitUserList(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,，、\n]/)
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
