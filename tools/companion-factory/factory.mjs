#!/usr/bin/env node
/**
 * companion-factory — TEMPORARY content-seeding tool (delete when done).
 *
 * Batch-drafts companion personas & scenes with an LLM into local JSON files,
 * lets you review/edit/delete them by hand, then publishes the approved ones by
 * driving the product's existing image workflows over HTTP and writing the
 * official companion / scene rows straight into D1.
 *
 * This folder is intentionally self-contained (zero npm deps, plain Node ESM)
 * and outside the pnpm workspace so it can be removed with `rm -rf`.
 *
 * Usage:
 *   node tools/companion-factory/factory.mjs <command> [flags]
 *
 * Commands:
 *   models                          List image-model option ids (pick wf1Model / wfSceneModel)
 *   gen-personas  --count N --brief "..."   Draft N personas → drafts/personas.json
 *   gen-scenes    --count N --brief "..."   Draft N scenes   → drafts/scenes.json
 *   publish-personas                Publish reviewed personas (WF1 + D1 insert)
 *   publish-scenes                  Publish reviewed scenes  (wf_scene + D1 insert)
 *   status                          Show draft counts by status
 */

import { loadConfig, requireConfig } from './lib/config.mjs';
import { appendDrafts, loadDrafts, publishable, saveDrafts } from './lib/drafts.mjs';
import { generatePersonas, generateScenes } from './lib/llm.mjs';
import { listImageModels, startBaseArt, waitForArt } from './lib/api.mjs';
import { insertCompanion, insertScene, tierToUnlockCondition } from './lib/d1.mjs';

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i += 1;
      }
    }
  }
  return flags;
}

const log = (...a) => console.log(...a);

async function cmdModels(cfg) {
  requireConfig(cfg, ['apiBaseUrl', 'adminToken']);
  const models = await listImageModels(cfg);
  if (!models.length) {
    log('No image-model options returned. Configure the workflow catalog in admin first.');
    return;
  }
  log('Available image-model options (use the id for wf1Model / wfSceneModel):');
  for (const m of models) {
    log(`  ${m.id}  [${m.workflow_key}] ${m.label ?? ''}${m.ckpt_name ? ` · ${m.ckpt_name}` : ''}`);
  }
}

async function cmdGenPersonas(cfg, flags) {
  requireConfig(cfg, ['llm.apiKey']);
  const count = Number(flags.count ?? 5);
  const drafts = await generatePersonas(cfg, { brief: flags.brief, count });
  const { file, added, total } = appendDrafts('personas', drafts);
  log(`Drafted ${added} personas (file now has ${total}). Review/edit: ${file}`);
}

async function cmdGenScenes(cfg, flags) {
  requireConfig(cfg, ['llm.apiKey']);
  const count = Number(flags.count ?? 6);
  const drafts = await generateScenes(cfg, { brief: flags.brief, count });
  const { file, added, total } = appendDrafts('scenes', drafts);
  log(`Drafted ${added} scenes (file now has ${total}). Review/edit: ${file}`);
}

async function cmdPublishPersonas(cfg) {
  requireConfig(cfg, ['apiBaseUrl', 'adminToken', 'wf1Model']);
  const all = loadDrafts('personas');
  const todo = publishable(all);
  if (!todo.length) {
    log('No publishable persona drafts (all rejected/published).');
    return;
  }
  log(`Publishing ${todo.length} personas…`);
  for (const draft of todo) {
    try {
      log(`  • ${draft.name}: WF1 base art…`);
      const jobId = await startBaseArt(cfg, { model: cfg.wf1Model, prompt: draft.image_prompt });
      const artKey = await waitForArt(cfg, jobId);
      const companionId = insertCompanion(cfg, draft, artKey);
      log(`    inserted companion ${companionId}`);
      draft.status = 'published';
      draft.companion_id = companionId;
      draft.art_key = artKey;
      delete draft.emotion_jobs;
      delete draft.error;
      log('    ✓ published');
    } catch (err) {
      draft.status = 'failed';
      draft.error = String(err.message ?? err);
      log(`    ✗ failed: ${draft.error}`);
    }
    saveDrafts('personas', all);
  }
  log('Done.');
}

async function cmdPublishScenes(cfg) {
  requireConfig(cfg, ['apiBaseUrl', 'adminToken', 'wfSceneModel']);
  const all = loadDrafts('scenes');
  const todo = publishable(all);
  if (!todo.length) {
    log('No publishable scene drafts (all rejected/published).');
    return;
  }
  log(`Publishing ${todo.length} scenes…`);
  let order = 0;
  for (const draft of all) {
    if (draft.status === 'rejected' || draft.status === 'published') {
      order += 1;
      continue;
    }
    try {
      log(`  • ${draft.name} (${draft.id}): wf_scene background…`);
      const jobId = await startBaseArt(cfg, { model: cfg.wfSceneModel, prompt: draft.image_prompt });
      const artKey = await waitForArt(cfg, jobId);
      const anchor = (draft.default_companions ?? [])[0] ?? null;
      const unlock = tierToUnlockCondition(draft.unlock_tier, anchor);
      if (draft.unlock_tier && draft.unlock_tier !== 'public' && !anchor) {
        log(`    ! tier "${draft.unlock_tier}" has no default_companions anchor → scene left unlocked`);
      }
      insertScene(cfg, draft, artKey, unlock, order);
      draft.status = 'published';
      draft.art_key = artKey;
      draft.unlock_condition = unlock;
      delete draft.error;
      log(`    ✓ published (display_order=${order}, ${unlock ? 'gated' : 'public'})`);
    } catch (err) {
      draft.status = 'failed';
      draft.error = String(err.message ?? err);
      log(`    ✗ failed: ${draft.error}`);
    }
    order += 1;
    saveDrafts('scenes', all);
  }
  log('Done.');
}

function cmdStatus() {
  for (const kind of ['personas', 'scenes']) {
    const drafts = loadDrafts(kind);
    const counts = {};
    for (const d of drafts) counts[d.status ?? 'draft'] = (counts[d.status ?? 'draft'] ?? 0) + 1;
    const summary = Object.entries(counts).map(([k, v]) => `${k}:${v}`).join('  ') || '(none)';
    log(`${kind.padEnd(9)} ${drafts.length} total   ${summary}`);
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseArgs(rest);
  const cfg = loadConfig();

  switch (command) {
    case 'models': return cmdModels(cfg);
    case 'gen-personas': return cmdGenPersonas(cfg, flags);
    case 'gen-scenes': return cmdGenScenes(cfg, flags);
    case 'publish-personas': return cmdPublishPersonas(cfg);
    case 'publish-scenes': return cmdPublishScenes(cfg);
    case 'status': return cmdStatus();
    default:
      log('Unknown command. See the header of factory.mjs for usage.');
      log('Commands: models | gen-personas | gen-scenes | publish-personas | publish-scenes | status');
      process.exitCode = command ? 1 : 0;
  }
}

main().catch((err) => {
  console.error(`\nError: ${err.message ?? err}`);
  process.exitCode = 1;
});
