/**
 * Image generation provider abstraction (spec-020).
 *
 * Independent of the chat LLM abstraction in src/llm/ — different upstream
 * APIs, different request/response shape, different cost model. The shared
 * surface area is only the provider-pattern, not any code.
 */

export type NonNeutralEmotion =
  | "warm"
  | "playful"
  | "guarded"
  | "tense"
  | "annoyed";

export const NON_NEUTRAL_EMOTIONS: readonly NonNeutralEmotion[] = [
  "warm",
  "playful",
  "guarded",
  "tense",
  "annoyed",
];

export type CompanionPromptContext = {
  name: string;
  gender: string | null;
  appearance: string | null;
  personality: string | null;
  relationship_role: string | null;
};

export type ImageGenRequest = {
  /** R2 object key OR full URL of the neutral source portrait. */
  source_art_url: string;
  /** Full prompt text already composed with companion fields. */
  prompt: string;
  /** Target emotion the generated portrait should depict. */
  emotion: NonNeutralEmotion;
  /** Companion fields included for providers that accept structured context. */
  companion: CompanionPromptContext;
};

export type CompletedImageGenResponse = {
  type?: "completed";
  /** Generated image bytes ready to upload to R2. */
  image_bytes: Uint8Array;
  /** MIME type, e.g. "image/webp". */
  content_type: string;
  /** Provider identifier (e.g. "mock", "openai-gpt-image-1"). */
  provider: string;
  /** Model identifier inside the provider (free-form). */
  model: string;
};

export type PendingImageGenResponse = {
  type: "pending";
  /** External provider task id, used by webhook/polling finalization. */
  external_task_id: string;
  /** Provider identifier (e.g. "runninghub"). */
  provider: string;
  /** Model identifier inside the provider (free-form). */
  model: string;
};

export type ImageGenResponse = CompletedImageGenResponse | PendingImageGenResponse;

export interface ImageGenProvider {
  readonly name: string;
  generate(req: ImageGenRequest, env: Env): Promise<ImageGenResponse>;
}

export class ImageGenError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, options?: { retryable?: boolean }) {
    super(message);
    this.name = "ImageGenError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
  }
}
