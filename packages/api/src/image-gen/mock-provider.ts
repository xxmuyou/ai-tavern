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
    const key = normalizeKey(req.source_art_url);
    if (!key) {
      throw new ImageGenError("invalid_source_art_url", "source_art_url missing or invalid");
    }

    const object = await env.ASSETS.get(key);
    if (!object) {
      throw new ImageGenError(
        "source_art_not_found",
        `Source neutral art not found in R2: ${key}`,
      );
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
