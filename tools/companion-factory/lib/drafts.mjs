import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { DRAFTS_DIR } from './config.mjs';

/**
 * Local-file draft store. Drafts live as plain JSON in drafts/ so a human can
 * open, edit (rename / tweak fields), or delete entries between `generate` and
 * `publish`. No database, nothing permanent — review state is just these files.
 */

function ensureDir() {
  if (!existsSync(DRAFTS_DIR)) mkdirSync(DRAFTS_DIR, { recursive: true });
}

function pathFor(kind) {
  return join(DRAFTS_DIR, `${kind}.json`);
}

export function loadDrafts(kind) {
  const file = pathFor(kind);
  if (!existsSync(file)) return [];
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  return Array.isArray(parsed) ? parsed : [];
}

export function saveDrafts(kind, drafts) {
  ensureDir();
  writeFileSync(pathFor(kind), `${JSON.stringify(drafts, null, 2)}\n`, 'utf8');
  return pathFor(kind);
}

/** Append newly generated drafts (status='draft') to the existing file. */
export function appendDrafts(kind, items) {
  const existing = loadDrafts(kind);
  const stamped = items.map((item) => ({ status: 'draft', ...item }));
  const next = [...existing, ...stamped];
  return { file: saveDrafts(kind, next), added: stamped.length, total: next.length };
}

/** Drafts eligible to publish: not rejected, not already published. */
export function publishable(drafts) {
  return drafts.filter((d) => d.status !== 'rejected' && d.status !== 'published');
}
