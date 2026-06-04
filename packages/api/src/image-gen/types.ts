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

/**
 * Product-level generation mode (spec-022 §C.0).
 *
 * - `create`: base portrait (txt2img, or img2img when a source upload exists)
 * - `variation`: image variant from a confirmed base portrait (img2img)
 * - `cutout`: transparent companion matting from a confirmed base portrait
 */
export type ImageGenMode = "create" | "variation" | "cutout";

export type ImageGenRequest = {
  /**
   * Product mode. Defaults to `variation` for backward compatibility with the
   * older companion emotion-art pipeline (which never set it).
   */
  mode?: ImageGenMode;
  /**
   * Workflow to run, keyed into the unified `image_gen.workflows` config.
   * Resolved from the chosen model for `create` (defaults to `wf1`); `wf2` for
   * legacy `variation`; `wf_cutout` for transparent matting. See
   * image-gen/workflows.ts.
   */
  workflow_key?: string;
  /**
   * Checkpoint file to inject for `create`. Comes from the creator-selected WF1
   * checkpoint/model. Ignored when the workflow declares no checkpoint node.
   */
  ckpt_name?: string;
  /** Field name on the workflow's checkpoint node. Source is workflow config, not the model. */
  checkpoint_field_name?: string;
  /**
   * R2 object key OR full URL of the source portrait. Required for
   * `variation`; for `create` only set when re-painting an uploaded image.
   */
  source_art_url?: string;
  /** Full prompt text already composed with companion fields. Optional for cutout. */
  prompt?: string;
  /** Target emotion (only meaningful for `variation`). */
  emotion?: NonNeutralEmotion;
  /** Companion fields included for providers that accept structured context. */
  companion?: CompanionPromptContext;
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
