import { ensureUserByEmail, normalizeEmail, type UserRecord } from "./identity";
import { requireAuthEmail, requireAuthUser } from "./auth";
import { jsonResponse, readJson } from "./http";
import { generateText, type LlmMessage } from "./llm";
import { normalizeCharacterKey, normalizeDimensionKey, parseDefaultNumber, validateDimensionValue } from "./companion-engine/domain/dimensions";
import { asStringArray, isRecord, parseDimensionValue, readJsonArray, readJsonObject } from "./companion-engine/domain/json";
import { computeRelationshipUpdate } from "./companion-engine/domain/relationship-engine";
import { nextStepKey, renderScenePrompt } from "./companion-engine/domain/scene-engine";
import type { CharacterCard, DimensionDefinition, SceneOption, SceneStep } from "./companion-engine/domain/types";

const APP_KEY = "ai-companion";

type CharacterCardRow = {
  assets_json: string;
  character_key: string;
  display_name: string;
  id: string;
  identity_json: string;
  owner_user_id: string | null;
  persona_json: string;
  public_profile_json: string;
  status: "active" | "draft" | "retired";
  style_json: string;
  version: number;
  visibility: "private" | "public";
};

type CharacterDimensionRow = {
  dimension_key: string;
  value_json: string;
  visibility: "private" | "public";
};

type DimensionDefinitionRow = {
  applies_to: "both" | "character" | "relationship";
  default_value: string;
  description: string;
  dimension_key: string;
  label: string;
  max_value: number | null;
  min_value: number | null;
  status: "active" | "hidden" | "retired";
  value_type: "json" | "number" | "string" | "string_list";
};

type RelationshipRow = {
  character_card_id: string;
  character_key: string;
  character_version: number;
  id: string;
  status: "active" | "archived" | "paused";
  summary: string;
  updated_at: string;
  user_id: string;
};

type RelationshipDimensionRow = {
  dimension_key: string;
  value_json: string;
  value_number: number | null;
};

type ScenePackRow = {
  config_json: string;
  genre: string;
  id: string;
  scene_key: string;
  status: "active" | "draft" | "retired";
  summary: string;
  title: string;
  ui_labels_json: string;
};

type SceneStepRow = {
  is_terminal: number;
  options_json: string;
  prompt_template: string;
  scene_key: string;
  step_key: string;
  step_order: number;
};

type SceneSessionRow = {
  character_key: string;
  current_step_key: string;
  id: string;
  relationship_id: string;
  scene_key: string;
  status: "active" | "completed";
  turn_count: number;
  user_id: string;
};

type SceneTurnRow = {
  answer_text: string | null;
  character_key: string;
  id: string;
  options_json: string;
  prompt: string;
  relationship_id: string;
  response_text: string | null;
  scene_key: string;
  scene_session_id: string;
  selected_option_id: string | null;
  status: "answered" | "awaiting_user";
  step_key: string;
  turn_index: number;
  user_id: string;
};

type EmailBody = {
  actorEmail?: string;
  email?: string;
};

type CharacterCardBody = EmailBody & {
  assets?: Record<string, unknown>;
  characterKey?: string;
  dimensions?: Record<string, unknown>;
  displayName?: string;
  identity?: Record<string, unknown>;
  persona?: Record<string, unknown>;
  publicProfile?: Record<string, unknown>;
  style?: Record<string, unknown>;
  visibility?: "private" | "public";
};

type DimensionBody = EmailBody & {
  appliesTo?: "both" | "character" | "relationship";
  defaultValue?: unknown;
  description?: string;
  dimensionKey?: string;
  label?: string;
  maxValue?: number | null;
  minValue?: number | null;
  valueType?: "json" | "number" | "string" | "string_list";
};

type ScenePackBody = EmailBody & {
  config?: Record<string, unknown>;
  genre?: string;
  sceneKey?: string;
  steps?: Array<{
    isTerminal?: boolean;
    options?: SceneOption[];
    promptTemplate?: string;
    speakerMode?: "character" | "narrator";
    stepKey?: string;
    stepOrder?: number;
  }>;
  summary?: string;
  title?: string;
  uiLabels?: Record<string, unknown>;
};

type SceneSessionBody = EmailBody & {
  characterKey?: string;
};

type SceneAnswerBody = EmailBody & {
  freeText?: string;
  selectedOptionId?: string;
};

export async function handleCompanionEngineRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname === "/characters" && request.method === "GET") {
    return jsonResponse(await listCharacters(env));
  }

  const characterMatch = pathname.match(/^\/characters\/([^/]+)(?:\/(relationship|relationships))?$/);
  if (characterMatch) {
    const characterKey = decodeURIComponent(characterMatch[1] ?? "");
    const action = characterMatch[2] ?? "";

    if (!action && request.method === "GET") {
      return jsonResponse(await getCharacter(env, characterKey));
    }

    if (action === "relationship" && request.method === "GET") {
      const user = await requireAuthUser(env, request, new URL(request.url).searchParams.get("email"));
      return jsonResponse(await getOrCreateRelationship(env, characterKey, user));
    }

    if (action === "relationships" && request.method === "POST") {
      const body = await readJson<EmailBody>(request);
      const user = await requireAuthUser(env, request, body.email);
      return jsonResponse(await getOrCreateRelationship(env, characterKey, user), { status: 201 });
    }

    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  if (pathname === "/scenes" && request.method === "GET") {
    return jsonResponse(await listScenePacks(env));
  }

  const sceneMatch = pathname.match(/^\/scenes\/([^/]+)(?:\/sessions)?$/);
  if (sceneMatch) {
    const sceneKey = decodeURIComponent(sceneMatch[1] ?? "");
    if (!pathname.endsWith("/sessions") && request.method === "GET") {
      return jsonResponse(await getScenePackPayload(env, sceneKey));
    }

    if (pathname.endsWith("/sessions") && request.method === "POST") {
      const body = await readJson<SceneSessionBody>(request);
      body.email = await requireAuthEmail(env, request, body.email);
      return jsonResponse(await createSceneSession(env, sceneKey, body), { status: 201 });
    }

    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const answerMatch = pathname.match(/^\/scene-sessions\/([^/]+)\/turns\/([^/]+)\/answer$/);
  if (answerMatch && request.method === "POST") {
    const sessionId = decodeURIComponent(answerMatch[1] ?? "");
    const turnId = decodeURIComponent(answerMatch[2] ?? "");
    const body = await readJson<SceneAnswerBody>(request);
    body.email = await requireAuthEmail(env, request, body.email);
    return jsonResponse(await answerSceneTurn(env, sessionId, turnId, body));
  }

  const adminResponse = await handleCompanionAdminRequest(request, env, pathname);
  if (adminResponse) {
    return adminResponse;
  }

  return null;
}

async function handleCompanionAdminRequest(request: Request, env: Env, pathname: string): Promise<Response | null> {
  if (pathname === "/admin/dimension-definitions" && request.method === "GET") {
    return jsonResponse({ dimensions: [...(await getDimensionDefinitionMap(env)).values()] });
  }

  if (pathname === "/admin/dimension-definitions" && request.method === "POST") {
    const body = await readJson<DimensionBody>(request);
    return jsonResponse(await upsertDimensionDefinition(env, body, "create"), { status: 201 });
  }

  const dimensionMatch = pathname.match(/^\/admin\/dimension-definitions\/([^/]+)$/);
  if (dimensionMatch && request.method === "PATCH") {
    const body = await readJson<DimensionBody>(request);
    return jsonResponse(await upsertDimensionDefinition(env, { ...body, dimensionKey: decodeURIComponent(dimensionMatch[1] ?? "") }, "update"));
  }

  if (pathname === "/admin/character-cards" && request.method === "GET") {
    return jsonResponse(await listCharacters(env, { includePrivate: true }));
  }

  if (pathname === "/admin/character-cards" && request.method === "POST") {
    const body = await readJson<CharacterCardBody>(request);
    return jsonResponse(await createCharacterCard(env, body), { status: 201 });
  }

  const characterMatch = pathname.match(/^\/admin\/character-cards\/([^/]+)$/);
  if (characterMatch && request.method === "PATCH") {
    const body = await readJson<CharacterCardBody>(request);
    return jsonResponse(await publishNextCharacterVersion(env, decodeURIComponent(characterMatch[1] ?? ""), body));
  }

  if (pathname === "/admin/scene-packs" && request.method === "GET") {
    return jsonResponse(await listScenePacks(env, { includeDrafts: true }));
  }

  if (pathname === "/admin/scene-packs" && request.method === "POST") {
    const body = await readJson<ScenePackBody>(request);
    return jsonResponse(await upsertScenePack(env, body, "create"), { status: 201 });
  }

  const sceneMatch = pathname.match(/^\/admin\/scene-packs\/([^/]+)$/);
  if (sceneMatch && request.method === "PATCH") {
    const body = await readJson<ScenePackBody>(request);
    return jsonResponse(await upsertScenePack(env, { ...body, sceneKey: decodeURIComponent(sceneMatch[1] ?? "") }, "update"));
  }

  return null;
}

async function listCharacters(env: Env, options: { includePrivate?: boolean } = {}) {
  const visibilitySql = options.includePrivate ? "" : "AND visibility = 'public'";
  const { results } = await env.DB.prepare(
    `SELECT id, character_key, version, status, visibility, owner_user_id, display_name,
            identity_json, persona_json, style_json, assets_json, public_profile_json
     FROM character_cards
     WHERE is_default_version = 1 AND status = 'active' ${visibilitySql}
     ORDER BY display_name ASC`,
  ).all<CharacterCardRow>();

  const characters = await Promise.all(results.map((row) => serializeCharacterRow(env, row, false)));
  return { characters };
}

async function getCharacter(env: Env, characterKey: string) {
  const row = await requireDefaultCharacterRow(env, characterKey);
  return { character: await serializeCharacterRow(env, row, true) };
}

async function serializeCharacterRow(env: Env, row: CharacterCardRow, includePrivateDimensions: boolean) {
  const dimensions = await getCharacterDimensions(env, row.id, includePrivateDimensions);
  const publicProfile = readJsonObject(row.public_profile_json);
  const assets = readJsonObject(row.assets_json);
  return {
    assets,
    avatarObjectKey: typeof assets.avatarObjectKey === "string" ? assets.avatarObjectKey : null,
    characterKey: row.character_key,
    dimensions,
    displayName: row.display_name,
    id: row.id,
    identity: readJsonObject(row.identity_json),
    name: row.display_name,
    persona: readJsonObject(row.persona_json),
    publicProfile,
    status: row.status,
    style: readJsonObject(row.style_json),
    tags: asStringArray(publicProfile.tags),
    tagline: typeof publicProfile.tagline === "string" ? publicProfile.tagline : "",
    version: row.version,
    visibility: row.visibility,
  };
}

async function getOrCreateRelationship(env: Env, characterKey: string, user: UserRecord) {
  const character = await requireDefaultCharacterRow(env, characterKey);
  const existing = await env.DB.prepare(
    `SELECT id, user_id, character_key, character_card_id, character_version, status, summary, updated_at
     FROM user_character_relationships
     WHERE user_id = ? AND character_key = ?
     LIMIT 1`,
  )
    .bind(user.id, character.character_key)
    .first<RelationshipRow>();

  const relationship = existing ?? await createRelationshipForCharacter(env, character, user);
  return relationshipPayload(env, relationship, user);
}

async function createRelationshipForCharacter(env: Env, character: CharacterCardRow, user: UserRecord): Promise<RelationshipRow> {
  const relationshipId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO user_character_relationships (
       id, app_key, user_id, character_key, character_card_id, character_version, status
     )
     VALUES (?, ?, ?, ?, ?, ?, 'active')`,
  )
    .bind(relationshipId, APP_KEY, user.id, character.character_key, character.id, character.version)
    .run();

  const definitions = [...(await getDimensionDefinitionMap(env)).values()].filter(
    (definition) => definition.appliesTo === "relationship" || definition.appliesTo === "both",
  );

  for (const definition of definitions) {
    const value = definition.valueType === "number" ? parseDefaultNumber(definition.defaultValue) : definition.defaultValue;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO relationship_dimension_values (
         relationship_id, dimension_key, value_number, value_json
       )
       VALUES (?, ?, ?, ?)`,
    )
      .bind(
        relationshipId,
        definition.dimensionKey,
        typeof value === "number" ? value : null,
        JSON.stringify(value),
      )
      .run();
  }

  const created = await env.DB.prepare(
    `SELECT id, user_id, character_key, character_card_id, character_version, status, summary, updated_at
     FROM user_character_relationships
     WHERE id = ?`,
  )
    .bind(relationshipId)
    .first<RelationshipRow>();

  if (!created) {
    throw new Response("relationship_create_failed", { status: 500 });
  }

  return created;
}

async function relationshipPayload(env: Env, relationship: RelationshipRow, user: UserRecord) {
  const [characterRow, dimensions, recentEvents] = await Promise.all([
    requireCharacterRowById(env, relationship.character_card_id),
    getRelationshipDimensions(env, relationship.id),
    getRecentRelationshipEvents(env, relationship.id),
  ]);

  return {
    character: await serializeCharacterRow(env, characterRow, true),
    recentEvents,
    relationship: {
      characterKey: relationship.character_key,
      characterVersion: relationship.character_version,
      dimensions,
      id: relationship.id,
      status: relationship.status,
      summary: relationship.summary,
      updatedAt: relationship.updated_at,
      userId: user.id,
    },
    user: { email: user.email, id: user.id },
  };
}

async function listScenePacks(env: Env, options: { includeDrafts?: boolean } = {}) {
  const statusSql = options.includeDrafts ? "status != 'retired'" : "status = 'active'";
  const { results } = await env.DB.prepare(
    `SELECT id, scene_key, title, genre, summary, status, ui_labels_json, config_json
     FROM scene_packs
     WHERE ${statusSql}
     ORDER BY title ASC`,
  ).all<ScenePackRow>();

  return {
    scenes: results.map(serializeScenePackRow),
  };
}

async function getScenePackPayload(env: Env, sceneKey: string) {
  const scene = await requireScenePack(env, sceneKey);
  return {
    scene: serializeScenePackRow(scene),
    steps: (await getSceneSteps(env, scene.scene_key)).map(serializeSceneStep),
  };
}

async function createSceneSession(env: Env, sceneKey: string, body: SceneSessionBody) {
  const email = normalizeEmail(body.email);
  const characterKey = normalizeCharacterKey(body.characterKey);
  if (!email) {
    throw jsonResponse({ error: "email_required" }, { status: 400 });
  }
  if (!characterKey) {
    throw jsonResponse({ error: "character_key_required" }, { status: 400 });
  }

  const user = await ensureUserByEmail(env, email);
  const scene = await requireScenePack(env, sceneKey);
  const steps = await getSceneSteps(env, scene.scene_key);
  const firstStep = steps[0];
  if (!firstStep) {
    throw jsonResponse({ error: "scene_steps_missing" }, { status: 500 });
  }

  const relationshipPayloadData = await getOrCreateRelationship(env, characterKey, user);
  const relationship = relationshipPayloadData.relationship as { id: string };
  const character = await buildCharacterCard(env, await requireDefaultCharacterRow(env, characterKey), true);
  const sessionId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO scene_sessions (
       id, app_key, scene_key, user_id, character_key, relationship_id, status, current_step_key
     )
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
  )
    .bind(sessionId, APP_KEY, scene.scene_key, user.id, character.characterKey, relationship.id, firstStep.stepKey)
    .run();

  await createSceneTurn(env, {
    character,
    relationshipId: relationship.id,
    sceneKey: scene.scene_key,
    sessionId,
    step: firstStep,
    turnIndex: 1,
    user,
  });

  return getSceneSessionPayload(env, sessionId, user);
}

async function answerSceneTurn(env: Env, sessionId: string, turnId: string, body: SceneAnswerBody) {
  const email = normalizeEmail(body.email);
  if (!email) {
    throw jsonResponse({ error: "email_required" }, { status: 400 });
  }

  const user = await ensureUserByEmail(env, email);
  const [session, turn] = await Promise.all([
    requireSceneSession(env, sessionId, user),
    requireSceneTurn(env, sessionId, turnId, user),
  ]);
  if (turn.status !== "awaiting_user") {
    throw jsonResponse({ error: "scene_turn_already_answered" }, { status: 409 });
  }

  const characterRow = await requireDefaultCharacterRow(env, session.character_key);
  const character = await buildCharacterCard(env, characterRow, true);
  const definitions = await getDimensionDefinitionMap(env);
  const relationshipDimensions = await getRelationshipDimensions(env, session.relationship_id);
  const options = readSceneOptions(turn.options_json);
  const selectedOptionId = body.selectedOptionId?.trim() ?? "";
  const selectedOption = options.find((option) => option.id === selectedOptionId) ?? null;
  const freeText = normalizeText(body.freeText, 1200);
  if (!selectedOption && !freeText) {
    throw jsonResponse({ error: "answer_required" }, { status: 400 });
  }

  const answerText = [selectedOption?.preview, freeText].filter(Boolean).join(" ");
  const update = computeRelationshipUpdate({
    answerText,
    character,
    definitions,
    relationship: {
      dimensions: relationshipDimensions,
      id: session.relationship_id,
    },
    selectedOption,
  });
  const responseText = await generateCompanionLine(env, {
    answerText,
    character,
    deltas: update.deltas,
    relationshipDimensions: update.nextDimensions,
    sceneKey: session.scene_key,
    sessionId,
    signals: update.signals,
    user,
  });

  for (const [dimension, value] of Object.entries(update.nextDimensions)) {
    await env.DB.prepare(
      `INSERT INTO relationship_dimension_values (
         relationship_id, dimension_key, value_number, value_json, updated_at
       )
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(relationship_id, dimension_key) DO UPDATE SET
         value_number = excluded.value_number,
         value_json = excluded.value_json,
         updated_at = CURRENT_TIMESTAMP`,
    )
      .bind(session.relationship_id, dimension, value, JSON.stringify(value))
      .run();
  }

  await env.DB.prepare(
    `UPDATE scene_turns
     SET selected_option_id = ?, answer_text = ?, response_text = ?, status = 'answered', updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  )
    .bind(selectedOption?.id ?? null, answerText, responseText, turn.id, user.id)
    .run();

  await env.DB.prepare(
    `INSERT INTO relationship_events (
       id, relationship_id, scene_session_id, scene_turn_id, event_type, signals_json, dimension_deltas_json, memory_text
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      session.relationship_id,
      session.id,
      turn.id,
      "scene_turn_answered",
      JSON.stringify(update.signals),
      JSON.stringify(update.deltas),
      update.memoryText,
    )
    .run();

  const steps = await getSceneSteps(env, session.scene_key);
  const nextKey = nextStepKey(steps, turn.step_key);
  const nextStep = nextKey ? steps.find((step) => step.stepKey === nextKey) : null;
  if (nextStep) {
    const nextCount = session.turn_count + 1;
    await env.DB.prepare(
      `UPDATE scene_sessions
       SET current_step_key = ?, turn_count = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
    )
      .bind(nextStep.stepKey, nextCount, session.id, user.id)
      .run();
    await createSceneTurn(env, {
      character,
      relationshipId: session.relationship_id,
      sceneKey: session.scene_key,
      sessionId: session.id,
      step: nextStep,
      turnIndex: turn.turn_index + 1,
      user,
    });
  } else {
    await env.DB.prepare(
      `UPDATE scene_sessions
       SET status = 'completed', turn_count = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
    )
      .bind(session.turn_count + 1, session.id, user.id)
      .run();
  }

  await env.DB.prepare(
    `UPDATE user_character_relationships
     SET summary = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  )
    .bind(update.memoryText, session.relationship_id, user.id)
    .run();

  return getSceneSessionPayload(env, session.id, user);
}

async function createSceneTurn(
  env: Env,
  input: {
    character: CharacterCard;
    relationshipId: string;
    sceneKey: string;
    sessionId: string;
    step: SceneStep;
    turnIndex: number;
    user: UserRecord;
  },
) {
  await env.DB.prepare(
    `INSERT INTO scene_turns (
       id, scene_session_id, app_key, user_id, character_key, relationship_id, scene_key,
       step_key, turn_index, prompt, options_json
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      input.sessionId,
      APP_KEY,
      input.user.id,
      input.character.characterKey,
      input.relationshipId,
      input.sceneKey,
      input.step.stepKey,
      input.turnIndex,
      renderScenePrompt(input.step, input.character),
      JSON.stringify(input.step.options),
    )
    .run();
}

async function getSceneSessionPayload(env: Env, sessionId: string, user: UserRecord) {
  const session = await requireSceneSession(env, sessionId, user);
  const [turns, scene, relationship] = await Promise.all([
    getSceneTurns(env, session.id, user),
    requireScenePack(env, session.scene_key),
    getRelationshipById(env, session.relationship_id, user),
  ]);
  const currentTurn = turns.find((turn) => turn.status === "awaiting_user") ?? null;
  const relation = await relationshipPayload(env, relationship, user);

  return {
    currentTurn: currentTurn ? serializeSceneTurn(currentTurn) : null,
    relationship: relation.relationship,
    scene: serializeScenePackRow(scene),
    session: {
      characterKey: session.character_key,
      currentStepKey: session.current_step_key,
      id: session.id,
      sceneKey: session.scene_key,
      status: session.status,
      turnCount: session.turn_count,
    },
    turns: turns.map(serializeSceneTurn),
  };
}

async function generateCompanionLine(
  env: Env,
  input: {
    answerText: string;
    character: CharacterCard;
    deltas: Record<string, number>;
    relationshipDimensions: Record<string, number>;
    sceneKey: string;
    sessionId: string;
    signals: string[];
    user: UserRecord;
  },
): Promise<string> {
  const name = input.character.displayName;
  const fallbackText = fallbackCompanionLine(name, input.signals, input.deltas);
  const messages: LlmMessage[] = [
    {
      content: [
        "You write safe, emotionally grounded dialogue for an AI companion character game.",
        "The character card and relationship dimensions are the core truth.",
        "The scene is only context; do not mention game mechanics, scores, JSON, or hidden rules.",
        "Return one concise spoken line from the character, under 55 words.",
      ].join(" "),
      role: "system",
    },
    {
      content: [
        `Character: ${JSON.stringify({
          identity: input.character.identity,
          persona: input.character.persona,
          style: input.character.style,
          publicProfile: input.character.publicProfile,
        })}`,
        `Relationship dimensions: ${JSON.stringify(input.relationshipDimensions)}`,
        `Current scene: ${input.sceneKey}`,
        `User answer: ${input.answerText}`,
        `Detected signals: ${input.signals.join(", ") || "none"}`,
        `Dimension changes: ${JSON.stringify(input.deltas)}`,
      ].join("\n"),
      role: "user",
    },
  ];
  const result = await generateText(env, {
    fallbackText,
    maxOutputTokens: 180,
    messages,
    metadata: {
      appKey: APP_KEY,
      purpose: "companion_scene_line",
      sessionId: input.sessionId,
      userId: input.user.id,
    },
    route: "cheap-dialogue",
    temperature: 0.7,
  });

  return result.text;
}

function fallbackCompanionLine(name: string, signals: string[], deltas: Record<string, number>): string {
  if ((deltas.caution ?? 0) > 5 || (deltas.trust ?? 0) < -3) {
    return `${name} pauses before answering. "I want to understand you, but I need this to feel careful and real."`;
  }

  if (signals.includes("humor") || (deltas.affection ?? 0) > 5) {
    return `${name} smiles into the quiet. "That felt like you let me see the room a little warmer. Keep going."`;
  }

  if ((deltas.trust ?? 0) > 4 || signals.includes("honesty")) {
    return `${name} softens. "That sounded honest in a way I would rather remember than rush past."`;
  }

  return `${name} stays present. "I am listening. The small details are starting to tell me how to meet you."`;
}

async function upsertDimensionDefinition(env: Env, body: DimensionBody, mode: "create" | "update") {
  const dimensionKey = normalizeDimensionKey(body.dimensionKey);
  const label = normalizeText(body.label, 120);
  const valueType = body.valueType;
  const appliesTo = body.appliesTo ?? "both";
  if (!dimensionKey || !label || !valueType) {
    throw jsonResponse({ error: "invalid_dimension_definition" }, { status: 400 });
  }

  await env.DB.prepare(
    `INSERT INTO dimension_definitions (
       dimension_key, label, description, value_type, min_value, max_value, default_value, applies_to, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(dimension_key) DO UPDATE SET
       label = excluded.label,
       description = excluded.description,
       value_type = excluded.value_type,
       min_value = excluded.min_value,
       max_value = excluded.max_value,
       default_value = excluded.default_value,
       applies_to = excluded.applies_to,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      dimensionKey,
      label,
      normalizeText(body.description, 500),
      valueType,
      body.minValue ?? null,
      body.maxValue ?? null,
      JSON.stringify(body.defaultValue ?? defaultForValueType(valueType)),
      appliesTo,
    )
    .run();

  await insertAdminAudit(env, body.actorEmail, `${mode}_dimension_definition`, "dimension_definition", dimensionKey, body);
  return { dimension: (await getDimensionDefinitionMap(env)).get(dimensionKey) };
}

async function createCharacterCard(env: Env, body: CharacterCardBody) {
  const characterKey = normalizeCharacterKey(body.characterKey ?? body.displayName);
  const displayName = normalizeText(body.displayName, 120);
  if (!characterKey || !displayName) {
    throw jsonResponse({ error: "invalid_character_card" }, { status: 400 });
  }

  const existing = await env.DB.prepare("SELECT id FROM character_cards WHERE character_key = ? LIMIT 1")
    .bind(characterKey)
    .first<{ id: string }>();
  if (existing) {
    throw jsonResponse({ error: "character_key_exists" }, { status: 409 });
  }

  const id = `character-${characterKey}-v1`;
  await insertCharacterCard(env, {
    ...body,
    characterKey,
    displayName,
    id,
    isDefaultVersion: true,
    version: 1,
  });
  await insertCharacterDimensions(env, id, body.dimensions ?? {});
  await insertAdminAudit(env, body.actorEmail, "create_character_card", "character_card", characterKey, body);
  return getCharacter(env, characterKey);
}

async function publishNextCharacterVersion(env: Env, characterKeyValue: string, body: CharacterCardBody) {
  const characterKey = normalizeCharacterKey(characterKeyValue);
  const current = await requireDefaultCharacterRow(env, characterKey);
  const currentCard = await buildCharacterCard(env, current, true);
  const nextVersion = current.version + 1;
  const id = `character-${characterKey}-v${nextVersion}`;
  await env.DB.prepare("UPDATE character_cards SET is_default_version = 0, updated_at = CURRENT_TIMESTAMP WHERE character_key = ?")
    .bind(characterKey)
    .run();

  await insertCharacterCard(env, {
    assets: body.assets ?? currentCard.assets,
    characterKey,
    displayName: normalizeText(body.displayName, 120) || current.display_name,
    id,
    identity: body.identity ?? currentCard.identity,
    isDefaultVersion: true,
    persona: body.persona ?? currentCard.persona,
    publicProfile: body.publicProfile ?? currentCard.publicProfile,
    style: body.style ?? currentCard.style,
    version: nextVersion,
    visibility: body.visibility ?? current.visibility,
  });
  await insertCharacterDimensions(env, id, { ...currentCard.dimensions, ...(body.dimensions ?? {}) });
  await insertAdminAudit(env, body.actorEmail, "publish_character_version", "character_card", characterKey, body);
  return getCharacter(env, characterKey);
}

async function insertCharacterCard(
  env: Env,
  input: CharacterCardBody & {
    id: string;
    isDefaultVersion: boolean;
    version: number;
  },
) {
  await env.DB.prepare(
    `INSERT INTO character_cards (
       id, character_key, version, status, visibility, is_default_version, display_name,
       identity_json, persona_json, style_json, assets_json, public_profile_json, updated_at
     )
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
  )
    .bind(
      input.id,
      input.characterKey,
      input.version,
      input.visibility ?? "public",
      input.isDefaultVersion ? 1 : 0,
      input.displayName,
      JSON.stringify(input.identity ?? { name: input.displayName }),
      JSON.stringify(input.persona ?? {}),
      JSON.stringify(input.style ?? {}),
      JSON.stringify(input.assets ?? {}),
      JSON.stringify(input.publicProfile ?? {}),
    )
    .run();
}

async function insertCharacterDimensions(env: Env, characterCardId: string, values: Record<string, unknown>) {
  const definitions = await getDimensionDefinitionMap(env);
  for (const [rawKey, rawValue] of Object.entries(values)) {
    const key = normalizeDimensionKey(rawKey);
    const definition = definitions.get(key);
    if (!definition || (definition.appliesTo !== "character" && definition.appliesTo !== "both")) {
      continue;
    }
    const value = validateDimensionValue(rawValue, definition);
    await env.DB.prepare(
      `INSERT OR REPLACE INTO character_dimension_values (
         character_card_id, dimension_key, value_json, visibility, updated_at
       )
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    )
      .bind(characterCardId, key, JSON.stringify(value), "private")
      .run();
  }
}

async function upsertScenePack(env: Env, body: ScenePackBody, mode: "create" | "update") {
  const sceneKey = normalizeCharacterKey(body.sceneKey);
  const title = normalizeText(body.title, 160);
  if (!sceneKey || !title) {
    throw jsonResponse({ error: "invalid_scene_pack" }, { status: 400 });
  }

  const id = `scene-${sceneKey}`;
  await env.DB.prepare(
    `INSERT INTO scene_packs (
       id, scene_key, title, genre, summary, status, ui_labels_json, config_json, updated_at
     )
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(scene_key) DO UPDATE SET
       title = excluded.title,
       genre = excluded.genre,
       summary = excluded.summary,
       ui_labels_json = excluded.ui_labels_json,
       config_json = excluded.config_json,
       status = excluded.status,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      id,
      sceneKey,
      title,
      normalizeText(body.genre, 80) || "companion",
      normalizeText(body.summary, 1000),
      JSON.stringify(body.uiLabels ?? {}),
      JSON.stringify(body.config ?? {}),
    )
    .run();

  if (body.steps) {
    await env.DB.prepare("DELETE FROM scene_steps WHERE scene_key = ?").bind(sceneKey).run();
    for (const step of body.steps) {
      const stepKey = normalizeCharacterKey(step.stepKey);
      if (!stepKey || !step.promptTemplate || !Array.isArray(step.options)) {
        throw jsonResponse({ error: "invalid_scene_step" }, { status: 400 });
      }
      await env.DB.prepare(
        `INSERT INTO scene_steps (
           id, scene_key, step_key, step_order, speaker_mode, prompt_template, options_json, relationship_effects_json, is_terminal
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?)`,
      )
        .bind(
          `scene-${sceneKey}-${stepKey}`,
          sceneKey,
          stepKey,
          step.stepOrder ?? 10,
          step.speakerMode ?? "character",
          step.promptTemplate,
          JSON.stringify(step.options.map(normalizeSceneOption)),
          step.isTerminal ? 1 : 0,
        )
        .run();
    }
  }

  await insertAdminAudit(env, body.actorEmail, `${mode}_scene_pack`, "scene_pack", sceneKey, body);
  return getScenePackPayload(env, sceneKey);
}

async function getDimensionDefinitionMap(env: Env): Promise<Map<string, DimensionDefinition>> {
  const { results } = await env.DB.prepare(
    `SELECT dimension_key, label, description, value_type, min_value, max_value, default_value, applies_to, status
     FROM dimension_definitions
     WHERE status = 'active'`,
  ).all<DimensionDefinitionRow>();

  return new Map(results.map((row) => [row.dimension_key, serializeDimensionDefinition(row)]));
}

function serializeDimensionDefinition(row: DimensionDefinitionRow): DimensionDefinition {
  return {
    appliesTo: row.applies_to,
    defaultValue: parseDimensionValue(row.default_value, defaultForValueType(row.value_type)),
    dimensionKey: row.dimension_key,
    label: row.label,
    maxValue: row.max_value,
    minValue: row.min_value,
    valueType: row.value_type,
  };
}

async function buildCharacterCard(env: Env, row: CharacterCardRow, includePrivateDimensions: boolean): Promise<CharacterCard> {
  return {
    assets: readJsonObject(row.assets_json),
    characterKey: row.character_key,
    dimensions: await getCharacterDimensions(env, row.id, includePrivateDimensions),
    displayName: row.display_name,
    id: row.id,
    identity: readJsonObject(row.identity_json),
    persona: readJsonObject(row.persona_json),
    publicProfile: readJsonObject(row.public_profile_json),
    style: readJsonObject(row.style_json),
    version: row.version,
  };
}

async function getCharacterDimensions(env: Env, characterCardId: string, includePrivate: boolean): Promise<Record<string, unknown>> {
  const visibilitySql = includePrivate ? "" : "AND visibility = 'public'";
  const { results } = await env.DB.prepare(
    `SELECT dimension_key, value_json, visibility
     FROM character_dimension_values
     WHERE character_card_id = ? ${visibilitySql}
     ORDER BY dimension_key ASC`,
  )
    .bind(characterCardId)
    .all<CharacterDimensionRow>();
  const dimensions: Record<string, unknown> = {};
  for (const row of results) {
    dimensions[row.dimension_key] = parseDimensionValue(row.value_json, null);
  }
  return dimensions;
}

async function getRelationshipDimensions(env: Env, relationshipId: string): Promise<Record<string, number>> {
  const { results } = await env.DB.prepare(
    `SELECT dimension_key, value_number, value_json
     FROM relationship_dimension_values
     WHERE relationship_id = ?
     ORDER BY dimension_key ASC`,
  )
    .bind(relationshipId)
    .all<RelationshipDimensionRow>();
  const dimensions: Record<string, number> = {};
  for (const row of results) {
    dimensions[row.dimension_key] = row.value_number ?? parseDefaultNumber(parseDimensionValue(row.value_json, 0));
  }
  return dimensions;
}

async function getRecentRelationshipEvents(env: Env, relationshipId: string) {
  const { results } = await env.DB.prepare(
    `SELECT id, event_type, signals_json, dimension_deltas_json, memory_text, created_at
     FROM relationship_events
     WHERE relationship_id = ?
     ORDER BY created_at DESC
     LIMIT 12`,
  )
    .bind(relationshipId)
    .all<{
      created_at: string;
      dimension_deltas_json: string;
      event_type: string;
      id: string;
      memory_text: string;
      signals_json: string;
    }>();

  return results.map((row) => ({
    createdAt: row.created_at,
    deltas: readJsonObject(row.dimension_deltas_json),
    id: row.id,
    memoryText: row.memory_text,
    signals: readJsonArray(row.signals_json).filter((signal): signal is string => typeof signal === "string"),
    type: row.event_type,
  }));
}

async function requireDefaultCharacterRow(env: Env, characterKeyValue: string): Promise<CharacterCardRow> {
  const characterKey = normalizeCharacterKey(characterKeyValue);
  const row = await env.DB.prepare(
    `SELECT id, character_key, version, status, visibility, owner_user_id, display_name,
            identity_json, persona_json, style_json, assets_json, public_profile_json
     FROM character_cards
     WHERE character_key = ? AND is_default_version = 1 AND status = 'active'
     LIMIT 1`,
  )
    .bind(characterKey)
    .first<CharacterCardRow>();
  if (!row) {
    throw jsonResponse({ error: "character_not_found" }, { status: 404 });
  }
  return row;
}

async function requireCharacterRowById(env: Env, id: string): Promise<CharacterCardRow> {
  const row = await env.DB.prepare(
    `SELECT id, character_key, version, status, visibility, owner_user_id, display_name,
            identity_json, persona_json, style_json, assets_json, public_profile_json
     FROM character_cards
     WHERE id = ?
     LIMIT 1`,
  )
    .bind(id)
    .first<CharacterCardRow>();
  if (!row) {
    throw jsonResponse({ error: "character_not_found" }, { status: 404 });
  }
  return row;
}

async function requireScenePack(env: Env, sceneKeyValue: string): Promise<ScenePackRow> {
  const sceneKey = normalizeCharacterKey(sceneKeyValue);
  const row = await env.DB.prepare(
    `SELECT id, scene_key, title, genre, summary, status, ui_labels_json, config_json
     FROM scene_packs
     WHERE scene_key = ? AND status = 'active'
     LIMIT 1`,
  )
    .bind(sceneKey)
    .first<ScenePackRow>();
  if (!row) {
    throw jsonResponse({ error: "scene_not_found" }, { status: 404 });
  }
  return row;
}

async function getSceneSteps(env: Env, sceneKey: string): Promise<SceneStep[]> {
  const { results } = await env.DB.prepare(
    `SELECT scene_key, step_key, step_order, prompt_template, options_json, is_terminal
     FROM scene_steps
     WHERE scene_key = ?
     ORDER BY step_order ASC`,
  )
    .bind(sceneKey)
    .all<SceneStepRow>();

  return results.map((row) => ({
    isTerminal: row.is_terminal === 1,
    options: readSceneOptions(row.options_json),
    promptTemplate: row.prompt_template,
    sceneKey: row.scene_key,
    stepKey: row.step_key,
    stepOrder: row.step_order,
  }));
}

async function requireSceneSession(env: Env, sessionId: string, user: UserRecord): Promise<SceneSessionRow> {
  const row = await env.DB.prepare(
    `SELECT id, scene_key, user_id, character_key, relationship_id, status, current_step_key, turn_count
     FROM scene_sessions
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
  )
    .bind(sessionId, user.id)
    .first<SceneSessionRow>();
  if (!row) {
    throw jsonResponse({ error: "scene_session_not_found" }, { status: 404 });
  }
  return row;
}

async function requireSceneTurn(env: Env, sessionId: string, turnId: string, user: UserRecord): Promise<SceneTurnRow> {
  const row = await env.DB.prepare(
    `SELECT id, scene_session_id, user_id, character_key, relationship_id, scene_key, step_key,
            turn_index, prompt, options_json, selected_option_id, answer_text, response_text, status
     FROM scene_turns
     WHERE id = ? AND scene_session_id = ? AND user_id = ?
     LIMIT 1`,
  )
    .bind(turnId, sessionId, user.id)
    .first<SceneTurnRow>();
  if (!row) {
    throw jsonResponse({ error: "scene_turn_not_found" }, { status: 404 });
  }
  return row;
}

async function getSceneTurns(env: Env, sessionId: string, user: UserRecord): Promise<SceneTurnRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, scene_session_id, user_id, character_key, relationship_id, scene_key, step_key,
            turn_index, prompt, options_json, selected_option_id, answer_text, response_text, status
     FROM scene_turns
     WHERE scene_session_id = ? AND user_id = ?
     ORDER BY turn_index ASC`,
  )
    .bind(sessionId, user.id)
    .all<SceneTurnRow>();
  return results;
}

async function getRelationshipById(env: Env, relationshipId: string, user: UserRecord): Promise<RelationshipRow> {
  const row = await env.DB.prepare(
    `SELECT id, user_id, character_key, character_card_id, character_version, status, summary, updated_at
     FROM user_character_relationships
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
  )
    .bind(relationshipId, user.id)
    .first<RelationshipRow>();
  if (!row) {
    throw jsonResponse({ error: "relationship_not_found" }, { status: 404 });
  }
  return row;
}

function serializeScenePackRow(row: ScenePackRow) {
  return {
    config: readJsonObject(row.config_json),
    genre: row.genre,
    id: row.id,
    sceneKey: row.scene_key,
    status: row.status,
    summary: row.summary,
    title: row.title,
    uiLabels: readJsonObject(row.ui_labels_json),
  };
}

function serializeSceneStep(step: SceneStep) {
  return {
    isTerminal: step.isTerminal,
    options: step.options,
    promptTemplate: step.promptTemplate,
    sceneKey: step.sceneKey,
    stepKey: step.stepKey,
    stepOrder: step.stepOrder,
  };
}

function serializeSceneTurn(row: SceneTurnRow) {
  return {
    answerText: row.answer_text,
    id: row.id,
    options: readSceneOptions(row.options_json),
    prompt: row.prompt,
    responseText: row.response_text,
    selectedOptionId: row.selected_option_id,
    status: row.status,
    stepKey: row.step_key,
    turnIndex: row.turn_index,
  };
}

function readSceneOptions(value: string): SceneOption[] {
  return readJsonArray(value).filter(isRecord).map(normalizeSceneOption).filter((option) => option.id && option.label);
}

function normalizeSceneOption(option: Record<string, unknown>): SceneOption {
  const relationshipEffects = isRecord(option.relationshipEffects)
    ? Object.fromEntries(
        Object.entries(option.relationshipEffects)
          .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
          .map(([key, value]) => [normalizeDimensionKey(key), value as number])
          .filter(([key]) => Boolean(key)),
      )
    : {};

  return {
    id: normalizeCharacterKey(typeof option.id === "string" ? option.id : ""),
    label: normalizeText(option.label, 80),
    preview: normalizeText(option.preview, 300),
    relationshipEffects,
    signals: asStringArray(option.signals).map(normalizeDimensionKey).filter(Boolean),
  };
}

async function insertAdminAudit(
  env: Env,
  actorEmail: string | undefined,
  action: string,
  targetType: string,
  targetKey: string,
  payload: unknown,
) {
  await env.DB.prepare(
    `INSERT INTO admin_audit_events (
       id, actor_email, action, target_type, target_key, payload_json
     )
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      normalizeEmail(actorEmail) ?? "",
      action,
      targetType,
      targetKey,
      JSON.stringify(payload ?? {}),
    )
    .run();
}

function defaultForValueType(valueType: "json" | "number" | "string" | "string_list"): unknown {
  if (valueType === "number") {
    return 0;
  }
  if (valueType === "string") {
    return "";
  }
  if (valueType === "string_list") {
    return [];
  }
  return {};
}

function normalizeText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}
