/**
 * Thin client for the EXISTING production HTTP endpoints used to run image
 * workflows. The tool never adds endpoints — it drives what's already there:
 *   POST /companions/base-art/generate         (run a workflow by model id)
 *   GET  /companions/base-art/jobs/{jobId}      (poll until done)
 * Auth: an admin's bearer JWT from config.adminToken.
 */

function authHeaders(cfg) {
  const token = String(cfg.adminToken || '');
  const value = token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
  return { authorization: value };
}

async function request(cfg, method, path, body) {
  const res = await fetch(`${cfg.apiBaseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...authHeaders(cfg) },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  }
  return json;
}

/** List image-model options (id → workflow+checkpoint) so a human can pick wf1Model / wfSceneModel. */
export async function listImageModels(cfg) {
  const json = await request(cfg, 'GET', '/image-models');
  return json.models ?? [];
}

/** Kick off a text-to-image run on the workflow that `model` resolves to. */
export async function startBaseArt(cfg, { model, prompt }) {
  const json = await request(cfg, 'POST', '/companions/base-art/generate', {
    source: 'text',
    model,
    prompt,
  });
  return json.job_id;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll a base-art job until it succeeds (returns R2 art key) or fails/times out. */
export async function waitForArt(cfg, jobId, { timeoutMs = 180000, intervalMs = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await request(cfg, 'GET', `/companions/base-art/jobs/${encodeURIComponent(jobId)}`);
    if (job.status === 'succeeded') {
      if (!job.art_key) throw new Error(`job ${jobId} succeeded without art_key`);
      return job.art_key;
    }
    if (job.status === 'failed' || job.status === 'cancelled') {
      throw new Error(`job ${jobId} ${job.status}: ${job.error_code ?? ''} ${job.error_message ?? ''}`.trim());
    }
    if (Date.now() > deadline) throw new Error(`job ${jobId} timed out after ${timeoutMs}ms (status=${job.status})`);
    await sleep(intervalMs);
  }
}
