import {
  ImageGenError,
  type ImageGenProvider,
  type ImageGenRequest,
  type ImageGenResponse,
} from "./types";

/**
 * Mock image generation provider (spec-020 placeholder).
 *
 * Reads the neutral source portrait from R2 and returns its bytes verbatim.
 * This exercises the full end-to-end pipeline (queue → consumer → R2 write
 * → DB update) without spending real provider quota. Real providers (OpenAI
 * gpt-image-1, etc.) plug in via the same interface later.
 */
export const mockImageGenProvider: ImageGenProvider = {
  name: "mock",

  async generate(req: ImageGenRequest, env: Env): Promise<ImageGenResponse> {
    if (req.mode === "cutout") {
      return transparentCutoutResponse();
    }

    // create (txt2img) has no source image — return a placeholder so the
    // full pipeline (queue → R2 write → DB update) still exercises locally.
    if (req.mode === "create" && !req.source_art_url) {
      return placeholderResponse();
    }

    const key = normalizeKey(req.source_art_url ?? "");
    if (!key) {
      throw new ImageGenError("invalid_source_art_url", "source_art_url missing or invalid");
    }

    const object = await env.ASSETS.get(key);
    if (!object) {
      // The source 立绘 usually lives only in the remote (dev/prod) R2, so locally
      // it's missing. Fall back to the placeholder instead of failing the job, so
      // moment-image capture still completes end-to-end on localhost.
      return placeholderResponse();
    }

    const buffer = await object.arrayBuffer();
    const contentType = object.httpMetadata?.contentType ?? "image/webp";

    return {
      content_type: contentType,
      image_bytes: new Uint8Array(buffer),
      model: "passthrough",
      provider: "mock",
    };
  },
};

const PLACEHOLDER_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAlgAAAGQCAIAAAD9V4nPAAAE30lEQVR42u3VMQ0AIAwAwdqsCWw2YUQJEhDB0qSXnIJfPlYWAIwVEgBghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghABghAAYoQoAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEAGCEARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARggARgiAEaoAgBECgBECgBECgBECgBECgBECgBECgBECgBECgBECgBECgBECgBECgBECgBECgBECgBECgBECgBECgBECgBECgBECQJsRnn0BYCwjBMAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAcAIAeBjhCsLAMYyQgCMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEACMEAAjVAEAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwQAIwTACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAHACAEwQgkAMEIAMEIAMEIAMEIAMEIAMEIAMEIAMEIAMEIAMEIAMEIAMEIAMEIAMEIAMEIAMEIAMEIAMEIAMEIAMEIAMEIAMEIA6OUBg4M30EpVpggAAAAASUVORK5CYII=";
const TRANSPARENT_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgFAY08xwwAAAABJRU5ErkJggg==";

function placeholderResponse(): ImageGenResponse {
  return {
    content_type: "image/png",
    image_bytes: PLACEHOLDER_PNG,
    model: "placeholder-create",
    provider: "mock",
  };
}

function transparentCutoutResponse(): ImageGenResponse {
  return {
    content_type: "image/png",
    image_bytes: TRANSPARENT_PNG,
    model: "transparent-cutout",
    provider: "mock",
  };
}

// A visible 600x400 brand-purple placeholder PNG (base64). Unlike a 1x1
// transparent pixel, this actually shows up in the chat bubble so the moment
// capture flow can be verified by eye on localhost.
const PLACEHOLDER_PNG = Uint8Array.from(atob(PLACEHOLDER_PNG_BASE64), (c) => c.charCodeAt(0));
const TRANSPARENT_PNG = Uint8Array.from(atob(TRANSPARENT_PNG_BASE64), (c) => c.charCodeAt(0));

/**
 * Strip a leading URL prefix or origin if the value looks like a URL.
 * Otherwise return as-is (R2 key). Empty / whitespace returns null.
 */
function normalizeKey(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      return u.pathname.replace(/^\/+/, "");
    } catch {
      return null;
    }
  }
  return trimmed.replace(/^\/+/, "");
}
