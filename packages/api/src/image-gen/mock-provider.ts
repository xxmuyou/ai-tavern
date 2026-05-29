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
    // create (txt2img) has no source image — return a placeholder so the
    // full pipeline (queue → R2 write → DB update) still exercises locally.
    if (req.mode === "create" && !req.source_art_url) {
      return {
        content_type: "image/png",
        image_bytes: PLACEHOLDER_PNG,
        model: "placeholder-create",
        provider: "mock",
      };
    }

    const key = normalizeKey(req.source_art_url ?? "");
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

// 1x1 transparent PNG — minimal valid image bytes for the create placeholder.
const PLACEHOLDER_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

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
