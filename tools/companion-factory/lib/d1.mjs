import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { REPO_ROOT } from './config.mjs';

/**
 * Direct D1 writes for the two rows that have no HTTP endpoint: official
 * companions and scenes. Done via `wrangler d1 execute` so the tool stays
 * self-contained (no new permanent API surface). Values are written to a temp
 * .sql file with doubled-quote escaping and run with --file.
 */

function sqlStr(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}
function sqlNum(value) {
  return Number.isFinite(value) ? String(value) : 'NULL';
}
function sqlJson(value) {
  if (value == null) return 'NULL';
  return sqlStr(JSON.stringify(value));
}

// Canonical relationship_role enum + synonym map, mirroring
// packages/api/src/relationships/seed.ts. The product only seeds initial
// dimensions for these 6 enums, so write canonical values (or NULL) — never raw
// free-text like "rival"/"love interest" that the engine can't map.
const RELATIONSHIP_ROLE_ENUM = new Set(['stranger', 'neighbor', 'colleague', 'friend', 'family', 'crush']);
const RELATIONSHIP_ROLE_SYNONYMS = {
  'best friend': 'friend', bestie: 'friend', bff: 'friend',
  'love interest': 'crush', lover: 'crush', partner: 'crush',
  mentor: 'colleague', coworker: 'colleague', 'co-worker': 'colleague', classmate: 'colleague',
  roommate: 'neighbor', acquaintance: 'neighbor',
  relative: 'family', sibling: 'family',
};
function normalizeRole(role) {
  if (typeof role !== 'string') return null;
  const key = role.trim().toLowerCase();
  if (key.length === 0) return null;
  if (RELATIONSHIP_ROLE_ENUM.has(key)) return key;
  return RELATIONSHIP_ROLE_SYNONYMS[key] ?? null;
}

/** Run one or more SQL statements against the configured D1 database. */
export function runSql(cfg, sql) {
  const dir = mkdtempSync(join(tmpdir(), 'factory-d1-'));
  const file = join(dir, 'stmt.sql');
  writeFileSync(file, sql, 'utf8');
  try {
    const args = [
      'wrangler', 'd1', 'execute', cfg.wrangler.dbName,
      '--config', cfg.wrangler.configPath,
      cfg.wrangler.remote ? '--remote' : '--local',
      '--file', file,
    ];
    const res = spawnSync('npx', args, { cwd: REPO_ROOT, encoding: 'utf8' });
    if (res.status !== 0) {
      throw new Error(`wrangler d1 execute failed (${res.status}):\n${res.stderr || res.stdout}`);
    }
    return res.stdout;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const VALID_DIMS = new Set(['closeness', 'trust', 'romance', 'friendship', 'hostility', 'tension', 'distance']);

/**
 * Map a scene's unlock tier to a min_relationship unlock_condition, anchored to
 * the scene's first default companion. Returns null when no gate applies or no
 * anchor companion is available.
 */
export function tierToUnlockCondition(tier, anchorCompanionId) {
  const presets = {
    public: null,
    casual: { dim: 'closeness', value: 15 },
    date: { dim: 'romance', value: 30 },
    intimate: { dim: 'romance', value: 60 },
  };
  const preset = presets[tier] ?? null;
  if (!preset) return null;
  if (!anchorCompanionId) return null;
  return { type: 'min_relationship', companion_id: anchorCompanionId, dim: preset.dim, value: preset.value };
}

export function isValidDim(dim) {
  return VALID_DIMS.has(dim);
}

/** Insert an official companion row. Returns the generated id. */
export function insertCompanion(cfg, draft, artKey) {
  const id = randomUUID();
  const now = Date.now();
  const artEmotions = artKey ? { neutral: artKey } : null;
  const sql = `INSERT INTO companions
    (id, source, created_by, is_active, name, appearance, personality, background, speech_style,
     relationship_role, want, secret, boundary, greeting, example_dialogues, tags, preferred_scenes,
     art_url, art_emotions, gender, initial_dims, is_public, play_count, created_at, updated_at)
   VALUES (
     ${sqlStr(id)}, 'official', NULL, 1, ${sqlStr(draft.name)}, ${sqlStr(draft.appearance)},
     ${sqlStr(draft.personality)}, ${sqlStr(draft.background)}, ${sqlStr(draft.speech_style)},
     ${sqlStr(normalizeRole(draft.relationship_role))}, ${sqlStr(draft.want)}, ${sqlStr(draft.secret)}, ${sqlStr(draft.boundary)},
     ${sqlStr(draft.greeting)}, ${sqlJson(draft.example_dialogues ?? null)}, ${sqlJson(draft.tags ?? [])},
     ${sqlJson(draft.preferred_scenes ?? [])}, ${sqlStr(artKey)}, ${sqlJson(artEmotions)},
     ${sqlStr(draft.gender)}, NULL, 1, 0, ${sqlNum(now)}, ${sqlNum(now)}
   );`;
  runSql(cfg, sql);
  return id;
}

/** Delete official companion rows recorded in persona drafts. */
export function deleteCompanions(cfg, companionIds) {
  const ids = [...new Set((companionIds ?? []).filter(Boolean))];
  if (!ids.length) return 0;
  const sql = `DELETE FROM companions
   WHERE source = 'official'
     AND id IN (${ids.map((id) => sqlStr(id)).join(', ')});`;
  runSql(cfg, sql);
  return ids.length;
}

/** Insert a scene row. Uses draft.id as the scene id (slug). */
export function insertScene(cfg, draft, artKey, unlockCondition, displayOrder) {
  const now = Date.now();
  const sql = `INSERT INTO scenes
    (id, name, mood, tags, possible_events, default_companions, unlock_condition, art_url, display_order, is_active, created_at)
   VALUES (
     ${sqlStr(draft.id)}, ${sqlStr(draft.name)}, ${sqlStr(draft.mood)}, ${sqlJson(draft.tags ?? [])},
     NULL, ${sqlJson(draft.default_companions ?? [])}, ${sqlJson(unlockCondition)}, ${sqlStr(artKey)},
     ${sqlNum(displayOrder)}, 1, ${sqlNum(now)}
   );`;
  runSql(cfg, sql);
  return draft.id;
}
