import { requireAuthUser } from "../auth";
import { jsonResponse } from "../http";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type UploadMetadata = {
  contentType: string;
  sizeBytes: number;
};

export async function handleCompanionArtUpload(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const user = await requireAuthUser(env, request);
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return jsonResponse({ error: "file_required" }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return jsonResponse({ error: "file_too_large" }, { status: 400 });
  }

  const contentType = file.type.toLowerCase();
  const extension = ALLOWED_IMAGE_TYPES[contentType];
  if (!extension) {
    return jsonResponse({ error: "invalid_file_type" }, { status: 400 });
  }

  const key = `companions/user/${user.id}/${crypto.randomUUID()}.${extension}`;
  await env.ASSETS.put(key, file.stream(), {
    httpMetadata: {
      contentType,
    },
    customMetadata: {
      owner: user.id,
      source: "companion-art",
    },
  });

  await recordCompanionArt(env, key, { contentType, sizeBytes: file.size });
  return jsonResponse({ key }, { status: 201 });
}

async function recordCompanionArt(env: Env, key: string, metadata: UploadMetadata): Promise<void> {
  await env.DB.prepare(
    "INSERT OR REPLACE INTO asset_objects (key, content_type, size_bytes) VALUES (?, ?, ?)",
  )
    .bind(key, metadata.contentType, metadata.sizeBytes)
    .run();
}
