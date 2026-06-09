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
 *   gen-personas  --male 50 --female 50 --batch-size 10 --brief "..."
 *   validate-personas [--male N --female N] Validate persona drafts before publishing
 *   gen-scenes    --count N --brief "..."   Draft N scenes   → drafts/scenes.json
 *   publish-personas [--limit N]     Publish reviewed personas (base art + D1 insert)
 *   publish-scenes                  Publish reviewed scenes  (wf_scene + D1 insert)
 *   rollback-personas --yes         Delete published companions recorded in drafts/personas.json
 *   status                          Show draft counts by status
 */

import { loadConfig, requireConfig } from './lib/config.mjs';
import { appendDrafts, loadDrafts, publishable, saveDrafts } from './lib/drafts.mjs';
import { generatePersonas, generateScenes } from './lib/llm.mjs';
import { listImageModels, startBaseArt, waitForArt } from './lib/api.mjs';
import { deleteCompanions, insertCompanion, insertScene, tierToUnlockCondition } from './lib/d1.mjs';

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

function intFlag(flags, key, fallback = 0) {
  const value = flags[key];
  if (value == null || value === true || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function truthyFlag(flags, key) {
  return flags[key] === true || flags[key] === '1' || flags[key] === 'true';
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value, max = 8) {
  return Array.isArray(value)
    ? value.map((item) => normalizeText(item)).filter(Boolean).slice(0, max)
    : [];
}

function optionStyle(model) {
  const haystack = [model.tag, model.label, model.model_id, model.workflow_key].join(' ').toLowerCase();
  if (haystack.includes('anime')) return 'anime';
  if (haystack.includes('realistic')) return 'realistic';
  return 'other';
}

function modelSlot(model, lora = null) {
  return {
    lora_id: lora?.id ?? null,
    lora_label: lora?.label ?? null,
    model: model.id,
    model_id: model.model_id,
    model_label: model.label,
    style_family: optionStyle(model),
    workflow_key: model.workflow_key,
  };
}

function buildPersonaModelPool(models) {
  const createModels = models.filter((model) => model.workflow_key === 'portrait_create');
  const loraModels = models.filter((model) => model.workflow_key === 'portrait_create_lora');
  const anime = [];
  const realistic = [];

  for (const model of loraModels) {
    const style = optionStyle(model);
    const target = style === 'anime' ? anime : style === 'realistic' ? realistic : null;
    if (!target) continue;
    if (Array.isArray(model.loras) && model.loras.length > 0) {
      for (const lora of model.loras) target.push(modelSlot(model, lora));
    } else {
      target.push(modelSlot(model));
    }
  }

  // Add no-LoRA create workflow options as extra variety. Prefer these for
  // checkpoints such as anime_animagine where no LoRA is bound.
  for (const model of createModels) {
    const style = optionStyle(model);
    const target = style === 'anime' ? anime : style === 'realistic' ? realistic : null;
    if (!target) continue;
    if (!target.some((slot) => slot.model_id === model.model_id && slot.lora_id == null)) {
      target.push(modelSlot(model));
    }
  }

  return { anime, realistic };
}

function pickPersonaModelSlot(pool, index) {
  const useRealistic = pool.realistic.length > 0 && index % 5 === 4;
  const target = useRealistic && pool.realistic.length ? pool.realistic : pool.anime.length ? pool.anime : pool.realistic;
  if (!target.length) return null;
  const offset = useRealistic ? Math.floor(index / 5) : index - Math.floor(index / 5);
  return target[offset % target.length];
}

function safeSeed(index) {
  return 100000000 + ((index + 1) * 7919) % 1900000000;
}

function polishImagePrompt(prompt, style) {
  const parts = [
    normalizeText(prompt),
    'adult original character',
    'safe for work',
    'fully clothed',
    'clean portrait composition',
    'plain or transparent background',
    'no real person, no celebrity likeness, no copyrighted character',
    'no nudity, no sexual content, no minor',
  ];
  if (style === 'anime') parts.push('high quality anime illustration');
  if (style === 'realistic') parts.push('high quality realistic portrait');
  return [...new Set(parts.filter(Boolean))].join(', ');
}

function normalizePersonaDraft(raw, { assignedGender, index, slot, sizePreset }) {
  const gender = assignedGender || (raw.gender === 'male' || raw.gender === 'female' ? raw.gender : 'female');
  return {
    name: normalizeText(raw.name),
    gender,
    appearance: normalizeText(raw.appearance),
    personality: normalizeText(raw.personality),
    background: normalizeText(raw.background),
    speech_style: normalizeText(raw.speech_style),
    relationship_role: normalizeText(raw.relationship_role),
    want: normalizeText(raw.want),
    secret: normalizeText(raw.secret),
    boundary: normalizeText(raw.boundary),
    greeting: normalizeText(raw.greeting),
    example_dialogues: normalizeStringArray(raw.example_dialogues, 4),
    tags: normalizeStringArray(raw.tags, 6).map((tag) => tag.toLowerCase()),
    preferred_scenes: normalizeStringArray(raw.preferred_scenes, 4).map((scene) => scene.toLowerCase()),
    image_prompt: polishImagePrompt(raw.image_prompt, slot?.style_family),
    model: slot?.model ?? '',
    model_id: slot?.model_id ?? '',
    model_label: slot?.model_label ?? '',
    workflow_key: slot?.workflow_key ?? '',
    lora_id: slot?.lora_id ?? null,
    lora_label: slot?.lora_label ?? null,
    style_family: slot?.style_family ?? '',
    seed: safeSeed(index),
    size_preset: sizePreset || null,
  };
}

function personaValidationErrors(drafts, { models = [], targetFemale = null, targetMale = null } = {}) {
  const errors = [];
  const active = drafts.filter((draft) => draft.status !== 'rejected');
  const modelMap = new Map(models.map((model) => [model.id, model]));
  const seenNames = new Map();
  const required = [
    'name', 'gender', 'appearance', 'personality', 'background', 'speech_style',
    'relationship_role', 'want', 'secret', 'boundary', 'greeting', 'image_prompt',
  ];

  active.forEach((draft, index) => {
    const label = draft.name || `#${index + 1}`;
    for (const key of required) {
      if (!normalizeText(draft[key])) errors.push(`${label}: missing ${key}`);
    }
    if (draft.gender !== 'male' && draft.gender !== 'female') {
      errors.push(`${label}: gender must be male/female`);
    }
    for (const key of ['example_dialogues', 'tags', 'preferred_scenes']) {
      if (!Array.isArray(draft[key]) || draft[key].length === 0) {
        errors.push(`${label}: ${key} must be a non-empty array`);
      }
    }
    const lowerName = normalizeText(draft.name).toLowerCase();
    if (lowerName) {
      if (seenNames.has(lowerName)) errors.push(`${label}: duplicate name with ${seenNames.get(lowerName)}`);
      else seenNames.set(lowerName, label);
    }
    if (models.length) {
      const modelId = normalizeText(draft.model);
      const model = modelMap.get(modelId);
      if (!model) {
        errors.push(`${label}: unknown model ${modelId || '(empty)'}`);
      } else if (draft.lora_id) {
        const loras = Array.isArray(model.loras) ? model.loras : [];
        if (!loras.some((lora) => lora.id === draft.lora_id)) {
          errors.push(`${label}: LoRA ${draft.lora_id} is not allowed for ${modelId}`);
        }
      }
      if (draft.size_preset && model?.generation_controls?.sizePresets) {
        const presets = model.generation_controls.sizePresets;
        if (!presets.some((preset) => preset.id === draft.size_preset)) {
          errors.push(`${label}: size_preset ${draft.size_preset} is not allowed for ${modelId}`);
        }
      }
    }
  });

  if (targetMale != null) {
    const actual = active.filter((draft) => draft.gender === 'male').length;
    if (actual !== targetMale) errors.push(`male count ${actual} !== expected ${targetMale}`);
  }
  if (targetFemale != null) {
    const actual = active.filter((draft) => draft.gender === 'female').length;
    if (actual !== targetFemale) errors.push(`female count ${actual} !== expected ${targetFemale}`);
  }

  return errors;
}

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
    for (const lora of m.loras ?? []) {
      log(`      lora: ${lora.id} · ${lora.label ?? ''}`);
    }
  }
}

async function cmdGenPersonas(cfg, flags) {
  requireConfig(cfg, ['llm.apiKey']);
  const maleTarget = intFlag(flags, 'male', 0);
  const femaleTarget = intFlag(flags, 'female', 0);
  const batchSize = Math.max(1, intFlag(flags, 'batch-size', 10));
  if (!maleTarget && !femaleTarget) {
    const count = intFlag(flags, 'count', 5);
    const models = (cfg.apiBaseUrl && cfg.adminToken) ? await listImageModels(cfg).catch(() => []) : [];
    const pool = buildPersonaModelPool(models);
    const existing = loadDrafts('personas');
    const baseIndex = existing.filter((draft) => draft.status !== 'rejected').length;
    const drafts = await generatePersonas(cfg, { brief: flags.brief, count });
    if (drafts.length !== count) {
      throw new Error(`LLM returned ${drafts.length} personas, expected ${count}. Retry with a smaller --count.`);
    }
    const prepared = drafts.map((draft, index) => {
      const slot = pickPersonaModelSlot(pool, baseIndex + index);
      return normalizePersonaDraft(draft, {
        index: baseIndex + index,
        sizePreset: cfg.personaSizePreset,
        slot,
      });
    });
    const { file, added, total } = appendDrafts('personas', prepared);
    log(`Drafted ${added} personas (file now has ${total}). Review/edit: ${file}`);
    return;
  }

  requireConfig(cfg, ['apiBaseUrl', 'adminToken']);
  const models = await listImageModels(cfg);
  const pool = buildPersonaModelPool(models);
  if (!pool.anime.length && !pool.realistic.length) {
    throw new Error('No usable portrait_create/portrait_create_lora model options returned from /image-models.');
  }

  let remainingMale = maleTarget;
  let remainingFemale = femaleTarget;
  const existing = loadDrafts('personas');
  let baseIndex = existing.filter((draft) => draft.status !== 'rejected').length;
  let addedTotal = 0;

  while (remainingMale > 0 || remainingFemale > 0) {
    const desiredMale = remainingMale > 0 && remainingFemale > 0
      ? Math.min(remainingMale, Math.floor(batchSize / 2))
      : Math.min(remainingMale, batchSize);
    const desiredFemale = remainingFemale > 0 && remainingMale > 0
      ? Math.min(remainingFemale, batchSize - desiredMale)
      : Math.min(remainingFemale, batchSize);
    const groups = [
      ['male', desiredMale],
      ['female', desiredFemale],
    ].filter(([, count]) => count > 0);

    const batchDrafts = [];
    const currentNames = () => loadDrafts('personas').map((draft) => draft.name).filter(Boolean);
    for (const [gender, count] of groups) {
      log(`Drafting ${count} ${gender} personas…`);
      const drafts = await generatePersonas(cfg, {
        brief: flags.brief,
        count,
        existingNames: [...currentNames(), ...batchDrafts.map((draft) => draft.name).filter(Boolean)],
        gender,
      });
      if (drafts.length !== count) {
        throw new Error(`LLM returned ${drafts.length} ${gender} personas, expected ${count}. Retry with a smaller --batch-size.`);
      }
      for (const draft of drafts) {
        const slot = pickPersonaModelSlot(pool, baseIndex + batchDrafts.length);
        batchDrafts.push(normalizePersonaDraft(draft, {
          assignedGender: gender,
          index: baseIndex + batchDrafts.length,
          sizePreset: cfg.personaSizePreset,
          slot,
        }));
      }
    }

    const { file, added, total } = appendDrafts('personas', batchDrafts);
    addedTotal += added;
    baseIndex += added;
    remainingMale -= desiredMale;
    remainingFemale -= desiredFemale;
    log(`Drafted batch of ${added} personas (file now has ${total}). Review/edit: ${file}`);
  }

  log(`Done drafting ${addedTotal} personas.`);
}

async function cmdValidatePersonas(cfg, flags) {
  const drafts = loadDrafts('personas');
  let models = [];
  if (cfg.apiBaseUrl && cfg.adminToken) {
    models = await listImageModels(cfg);
  } else {
    log('Skipping model/LoRA validation: apiBaseUrl/adminToken not configured.');
  }
  const errors = personaValidationErrors(drafts, {
    models,
    targetFemale: flags.female == null ? null : intFlag(flags, 'female', 0),
    targetMale: flags.male == null ? null : intFlag(flags, 'male', 0),
  });
  const active = drafts.filter((draft) => draft.status !== 'rejected');
  const counts = {
    female: active.filter((draft) => draft.gender === 'female').length,
    male: active.filter((draft) => draft.gender === 'male').length,
    total: active.length,
  };
  log(`Persona drafts: total=${counts.total} male=${counts.male} female=${counts.female}`);
  if (errors.length) {
    log(`Validation failed with ${errors.length} error(s):`);
    for (const error of errors) log(`  - ${error}`);
    process.exitCode = 1;
    return;
  }
  log('Persona drafts validated.');
}

async function cmdGenScenes(cfg, flags) {
  requireConfig(cfg, ['llm.apiKey']);
  const count = Number(flags.count ?? 6);
  const drafts = await generateScenes(cfg, { brief: flags.brief, count });
  const { file, added, total } = appendDrafts('scenes', drafts);
  log(`Drafted ${added} scenes (file now has ${total}). Review/edit: ${file}`);
}

async function cmdPublishPersonas(cfg, flags = {}) {
  requireConfig(cfg, ['apiBaseUrl', 'adminToken']);
  const all = loadDrafts('personas');
  const limit = intFlag(flags, 'limit', 0);
  const todo = publishable(all).slice(0, limit > 0 ? limit : undefined);
  if (!todo.length) {
    log('No publishable persona drafts (all rejected/published).');
    return;
  }
  for (const draft of todo) {
    if (!draft.model && cfg.wf1Model) draft.model = cfg.wf1Model;
    if (!draft.size_preset && cfg.personaSizePreset) draft.size_preset = cfg.personaSizePreset;
  }
  const models = await listImageModels(cfg);
  const errors = personaValidationErrors(todo, { models });
  if (errors.length) {
    log(`Refusing to publish: ${errors.length} validation error(s):`);
    for (const error of errors) log(`  - ${error}`);
    process.exitCode = 1;
    return;
  }
  log(`Publishing ${todo.length} personas…`);
  for (const draft of todo) {
    try {
      const modelLabel = [draft.model, draft.lora_id].filter(Boolean).join(' + ');
      log(`  • ${draft.name}: base art (${modelLabel})…`);
      const jobId = await startBaseArt(cfg, {
        lora_id: draft.lora_id || undefined,
        model: draft.model,
        prompt: draft.image_prompt,
        seed: draft.seed,
        size_preset: draft.size_preset || cfg.personaSizePreset,
      });
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

function cmdRollbackPersonas(cfg, flags) {
  requireConfig(cfg, ['wrangler.dbName', 'wrangler.configPath']);
  if (!truthyFlag(flags, 'yes')) {
    log('Refusing to rollback without --yes.');
    process.exitCode = 1;
    return;
  }
  const all = loadDrafts('personas');
  const targets = all.filter((draft) => draft.status === 'published' && draft.companion_id);
  if (!targets.length) {
    log('No published persona drafts with companion_id to rollback.');
    return;
  }
  const count = deleteCompanions(cfg, targets.map((draft) => draft.companion_id));
  for (const draft of targets) {
    draft.status = 'rolled_back';
    draft.rolled_back_at = Date.now();
  }
  saveDrafts('personas', all);
  log(`Rolled back ${count} companion row(s).`);
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
    case 'validate-personas': return cmdValidatePersonas(cfg, flags);
    case 'gen-scenes': return cmdGenScenes(cfg, flags);
    case 'publish-personas': return cmdPublishPersonas(cfg, flags);
    case 'publish-scenes': return cmdPublishScenes(cfg);
    case 'rollback-personas': return cmdRollbackPersonas(cfg, flags);
    case 'status': return cmdStatus();
    default:
      log('Unknown command. See the header of factory.mjs for usage.');
      log('Commands: models | gen-personas | validate-personas | gen-scenes | publish-personas | publish-scenes | rollback-personas | status');
      process.exitCode = command ? 1 : 0;
  }
}

main().catch((err) => {
  console.error(`\nError: ${err.message ?? err}`);
  process.exitCode = 1;
});
