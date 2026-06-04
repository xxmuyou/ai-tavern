import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const TOOL_DIR = resolve(here, '..');
// tools/companion-factory → repo root is three levels up.
export const REPO_ROOT = resolve(TOOL_DIR, '..', '..');
export const DRAFTS_DIR = join(TOOL_DIR, 'drafts');

const DEFAULTS = {
  apiBaseUrl: 'http://localhost:8787',
  adminToken: '',
  llm: {
    provider: 'deepseek',
    apiKey: '',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
  },
  // Image-model option ids from GET /image-models (workflow+checkpoint selection).
  wf1Model: '',
  wfSceneModel: '',
  wrangler: {
    configPath: 'infra/cloudflare/wrangler.jsonc',
    dbName: 'xtbit-apps-dev',
    remote: false,
  },
};

function deepMerge(base, override) {
  if (!override || typeof override !== 'object') return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object') {
      out[k] = deepMerge(out[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Load tool config: config.json (gitignored, in the tool dir) merged over
 * defaults, then a few env-var escape hatches on top. Everything the tool
 * needs lives here so the folder is fully self-contained and deletable.
 */
export function loadConfig() {
  let fileCfg = {};
  try {
    fileCfg = JSON.parse(readFileSync(join(TOOL_DIR, 'config.json'), 'utf8'));
  } catch {
    // No config.json yet — rely on defaults + env.
  }
  let cfg = deepMerge(DEFAULTS, fileCfg);

  const env = process.env;
  cfg = deepMerge(cfg, {
    apiBaseUrl: env.FACTORY_API_BASE_URL,
    adminToken: env.FACTORY_ADMIN_TOKEN,
    llm: {
      provider: env.FACTORY_LLM_PROVIDER,
      apiKey: env.FACTORY_LLM_API_KEY,
      model: env.FACTORY_LLM_MODEL,
      baseUrl: env.FACTORY_LLM_BASE_URL,
    },
    wf1Model: env.FACTORY_WF1_MODEL,
    wfSceneModel: env.FACTORY_WF_SCENE_MODEL,
    wrangler: {
      dbName: env.FACTORY_DB_NAME,
      remote: env.FACTORY_DB_REMOTE === '1' ? true : undefined,
    },
  });

  cfg.apiBaseUrl = String(cfg.apiBaseUrl || '').replace(/\/+$/, '');
  return cfg;
}

export function requireConfig(cfg, keys) {
  const missing = [];
  for (const key of keys) {
    const val = key.split('.').reduce((o, k) => (o == null ? o : o[k]), cfg);
    if (val == null || val === '') missing.push(key);
  }
  if (missing.length) {
    throw new Error(`Missing required config: ${missing.join(', ')} (set in tools/companion-factory/config.json or via env)`);
  }
}
