import { resolveImageGenConfig, type ImageGenConfig } from "../settings/store";
import { normalizeObjectKey } from "./signed-url";
import {
  ImageGenError,
  type ImageGenProvider,
  type ImageGenRequest,
  type ImageGenResponse,
} from "./types";

/**
 * OpenAI Images provider.
 *
 * - `create` (WF1): text-to-image via the generations endpoint.
 * - `variation` (WF2): image-to-image via the edits endpoint, using the source
 *   portrait bytes pulled from R2 (the edits endpoint takes a file upload, not
 *   a URL, so we cannot reuse the RunningHub signed-URL path).
 *
 * Both paths return a synchronous `completed` response (the caller already
 * handles both completed and pending shapes).
 */
const OPENAI_BASE_URL = "https://api.openai.com/v1";

export const openAiImageGenProvider: ImageGenProvider = {
  name: "openai",

  async generate(req: ImageGenRequest, env: Env): Promise<ImageGenResponse> {
    const cfg = await resolveImageGenConfig(env);
    const apiKey = requireApiKey(cfg);

    if (req.mode === "cutout") {
      throw new ImageGenError(
        "provider_not_supported",
        "OpenAI image provider does not support cutout/matting",
        { retryable: false },
      );
    }
    if (req.mode === "create" && !req.source_art_url) {
      return generateCreate(req, cfg, apiKey);
    }
    return generateVariation(req, env, cfg, apiKey);
  },
};

async function generateCreate(
  req: ImageGenRequest,
  cfg: ImageGenConfig,
  apiKey: string,
): Promise<ImageGenResponse> {
  const response = await fetch(`${OPENAI_BASE_URL}/images/generations`, {
    body: JSON.stringify({
      model: cfg.openai.model,
      n: 1,
      prompt: req.prompt,
      size: cfg.openai.size,
    }),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  return finalizeResponse(response, cfg.openai.model);
}

async function generateVariation(
  req: ImageGenRequest,
  env: Env,
  cfg: ImageGenConfig,
  apiKey: string,
): Promise<ImageGenResponse> {
  if (!req.source_art_url) {
    throw new ImageGenError(
      "invalid_source_art_url",
      "source_art_url is required for variation",
      { retryable: false },
    );
  }
  const key = normalizeObjectKey(req.source_art_url);
  if (!key) {
    throw new ImageGenError("invalid_source_art_url", "source_art_url missing or invalid", {
      retryable: false,
    });
  }
  const object = await env.ASSETS.get(key);
  if (!object) {
    throw new ImageGenError("source_art_not_found", `Source art not found in R2: ${key}`, {
      retryable: false,
    });
  }
  const sourceBytes = new Uint8Array(await object.arrayBuffer());
  const sourceType = object.httpMetadata?.contentType ?? "image/png";

  const form = new FormData();
  form.append("model", cfg.openai.model);
  form.append("prompt", req.prompt ?? "");
  form.append("size", cfg.openai.size);
  form.append("n", "1");
  form.append("image", new Blob([sourceBytes], { type: sourceType }), "source.png");

  const response = await fetch(`${OPENAI_BASE_URL}/images/edits`, {
    body: form,
    headers: { authorization: `Bearer ${apiKey}` },
    method: "POST",
  });
  return finalizeResponse(response, cfg.openai.model);
}

type OpenAiImageResponse = {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string; code?: string };
};

async function finalizeResponse(
  response: Response,
  model: string,
): Promise<ImageGenResponse> {
  const json = await readJson<OpenAiImageResponse>(response);
  if (!response.ok) {
    throw new ImageGenError(
      response.status === 401 ? "provider_not_configured" : "provider_error",
      json.error?.message || `OpenAI image request failed with HTTP ${response.status}`,
      { retryable: response.status >= 500 },
    );
  }

  const first = json.data?.[0];
  if (!first) {
    throw new ImageGenError("provider_bad_response", "OpenAI response had no image data", {
      retryable: true,
    });
  }

  const bytes = first.b64_json
    ? decodeBase64(first.b64_json)
    : first.url
      ? await fetchBytes(first.url)
      : null;
  if (!bytes) {
    throw new ImageGenError("provider_bad_response", "OpenAI response had no image bytes", {
      retryable: true,
    });
  }

  return {
    content_type: "image/png",
    image_bytes: bytes,
    model,
    provider: "openai",
    type: "completed",
  };
}

function requireApiKey(cfg: ImageGenConfig): string {
  if (!cfg.openai.apiKey) {
    throw new ImageGenError(
      "provider_not_configured",
      "OpenAI image provider missing config: api key",
      { retryable: false },
    );
  }
  return cfg.openai.apiKey;
}

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new ImageGenError(
      "provider_bad_response",
      `Failed to download OpenAI image: HTTP ${res.status}`,
      { retryable: true },
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new ImageGenError("provider_bad_response", "OpenAI response was not valid JSON", {
      retryable: true,
    });
  }
}
