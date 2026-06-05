import { normalizeObjectKey } from "./signed-url";

export type SourceArtAvailability =
  | { ok: true }
  | { error: "invalid_source_art_url" | "source_art_not_available"; key: string | null; ok: false };

export async function checkSourceArtAvailable(
  env: Env,
  sourceArtUrl: string,
): Promise<SourceArtAvailability> {
  const trimmed = sourceArtUrl.trim();
  if (!trimmed) {
    return { error: "invalid_source_art_url", key: null, ok: false };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return { error: "invalid_source_art_url", key: null, ok: false };
    }
    const path = url.pathname.replace(/^\/+/, "");
    if (!path.startsWith("objects/") && !path.startsWith("api/objects/")) {
      return { ok: true };
    }
  }

  const key = normalizeObjectKey(trimmed);
  if (!key) {
    return { error: "invalid_source_art_url", key: null, ok: false };
  }
  const object = await env.ASSETS.get(key);
  if (!object) {
    return { error: "source_art_not_available", key, ok: false };
  }
  return { ok: true };
}
