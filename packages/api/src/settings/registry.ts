/**
 * Registry of admin-visible operational settings.
 *
 * Each entry maps a canonical settings key to its UI type and the env var used
 * as a fallback when no DB override exists. Editable settings read through the
 * settings store (DB override → env fallback), so admins can configure
 * non-sensitive integrations from the workspace without redeploying.
 *
 * Secrets use adminMode "status_only": their real values are managed in
 * env/Wrangler secrets, never returned to the client, and old DB overrides are
 * ignored by runtime reads.
 *
 * Deliberately NOT managed here: build/deploy credentials and client bundle
 * vars (EXPO_PUBLIC_*, CLOUDFLARE_*, AWS_*). Those are not Worker runtime
 * knobs and changing them in D1 would not affect the deployed app.
 */
export type SettingType = "text" | "number" | "boolean" | "secret" | "json";
export type SettingAdminMode = "editable" | "status_only";

export type SettingGroup =
  | "auth"
  | "billing"
  | "credits"
  | "email"
  | "image_gen"
  | "limits"
  | "llm";

export type SettingDangerLevel = "normal" | "high";

export type SettingDef = {
  key: string;
  group: SettingGroup;
  label: string;
  type: SettingType;
  /**
   * editable: admins may save a D1 runtime override.
   * status_only: admins can only see whether the env/Wrangler value is set.
   */
  adminMode?: SettingAdminMode;
  /** Env var consulted when there is no DB override. */
  envKey?: string;
  dangerLevel?: SettingDangerLevel;
  description?: string;
};

export const SETTINGS: readonly SettingDef[] = [
  // --- auth ---
  {
    key: "auth.admin_emails",
    group: "auth",
    label: "Built-in admin emails",
    type: "text",
    envKey: "ADMIN_EMAILS",
    dangerLevel: "high",
    description: "Comma-separated admin emails. Misconfiguration can lock administrators out.",
  },
  {
    key: "auth.allowed_origins",
    group: "auth",
    label: "Allowed origins",
    type: "text",
    envKey: "ALLOWED_ORIGINS",
    dangerLevel: "high",
    description: "Comma-separated CORS and redirect origins.",
  },
  {
    key: "auth.success_url",
    group: "auth",
    label: "Auth success URL",
    type: "text",
    envKey: "AUTH_SUCCESS_URL",
    dangerLevel: "high",
  },
  {
    key: "auth.jwt_signing_key",
    group: "auth",
    label: "JWT signing key",
    type: "secret",
    adminMode: "status_only",
    envKey: "JWT_SIGNING_KEY",
    dangerLevel: "high",
    description: "Changing this invalidates existing sessions unless the legacy key remains configured.",
  },
  {
    key: "auth.legacy_token_secret",
    group: "auth",
    label: "Legacy auth token secret",
    type: "secret",
    adminMode: "status_only",
    envKey: "AUTH_TOKEN_SECRET",
    dangerLevel: "high",
  },
  {
    key: "auth.google_client_id",
    group: "auth",
    label: "Google OAuth client ID",
    type: "text",
    envKey: "GOOGLE_OAUTH_CLIENT_ID",
    dangerLevel: "high",
  },
  {
    key: "auth.google_client_secret",
    group: "auth",
    label: "Google OAuth client secret",
    type: "secret",
    adminMode: "status_only",
    envKey: "GOOGLE_OAUTH_CLIENT_SECRET",
    dangerLevel: "high",
  },

  // --- billing ---
  {
    key: "billing.stripe_secret_key",
    group: "billing",
    label: "Stripe secret key",
    type: "secret",
    adminMode: "status_only",
    envKey: "STRIPE_SECRET_KEY",
    dangerLevel: "high",
  },
  {
    key: "billing.stripe_webhook_secret",
    group: "billing",
    label: "Stripe webhook secret",
    type: "secret",
    adminMode: "status_only",
    envKey: "STRIPE_WEBHOOK_SECRET",
    dangerLevel: "high",
  },
  {
    key: "billing.pro_monthly_price",
    group: "billing",
    label: "Pro monthly price ID",
    type: "text",
    envKey: "STRIPE_PRICE_PRO_MONTHLY",
    description: "Public Stripe Price ID. Admin Settings override the env fallback.",
  },
  {
    key: "billing.credits_small_price",
    group: "billing",
    label: "Credits small price ID",
    type: "text",
    envKey: "STRIPE_PRICE_CREDITS_SMALL",
    description: "Public Stripe Price ID. Admin Settings override the env fallback.",
  },
  {
    key: "billing.credits_medium_price",
    group: "billing",
    label: "Credits medium price ID",
    type: "text",
    envKey: "STRIPE_PRICE_CREDITS_MEDIUM",
    description: "Public Stripe Price ID. Admin Settings override the env fallback.",
  },
  {
    key: "billing.credits_large_price",
    group: "billing",
    label: "Credits large price ID",
    type: "text",
    envKey: "STRIPE_PRICE_CREDITS_LARGE",
    description: "Public Stripe Price ID. Admin Settings override the env fallback.",
  },
  {
    key: "billing.success_url",
    group: "billing",
    label: "Stripe subscription success URL",
    type: "text",
    envKey: "STRIPE_SUCCESS_URL",
  },
  {
    key: "billing.cancel_url",
    group: "billing",
    label: "Stripe subscription cancel URL",
    type: "text",
    envKey: "STRIPE_CANCEL_URL",
  },
  {
    key: "billing.portal_return_url",
    group: "billing",
    label: "Stripe portal return URL",
    type: "text",
    envKey: "STRIPE_PORTAL_RETURN_URL",
  },
  {
    key: "billing.credits_success_url",
    group: "billing",
    label: "Credits checkout success URL",
    type: "text",
    envKey: "STRIPE_CREDITS_SUCCESS_URL",
  },
  {
    key: "billing.credits_cancel_url",
    group: "billing",
    label: "Credits checkout cancel URL",
    type: "text",
    envKey: "STRIPE_CREDITS_CANCEL_URL",
  },

  // --- credits ---
  {
    key: "credits.voice_generation_cost",
    group: "credits",
    label: "Voice generation cost",
    type: "number",
    description:
      "Credits charged the first time a user generates a voice clip for a message with a selected voice/speed. Defaults to 3 credits.",
  },

  // --- image_gen ---
  {
    key: "image_gen.provider",
    group: "image_gen",
    label: "Image provider (default)",
    type: "text",
    envKey: "IMAGE_GEN_PROVIDER",
    description:
      'Fallback engine when a workflow has no explicit provider. "runninghub", "openai", or "mock".',
  },
  {
    key: "image_gen.portrait_create_provider",
    group: "image_gen",
    label: "Portrait create provider",
    type: "text",
    envKey: "IMAGE_GEN_PORTRAIT_CREATE_PROVIDER",
    description:
      'Engine for base portrait creation: "runninghub", "openai", or "mock". Empty falls back to the default provider.',
  },
  {
    key: "image_gen.portrait_variation_provider",
    group: "image_gen",
    label: "Portrait variation provider",
    type: "text",
    envKey: "IMAGE_GEN_PORTRAIT_VARIATION_PROVIDER",
    description:
      'Engine for expression portrait variants: "runninghub", "openai", or "mock". Empty falls back to the default provider.',
  },
  {
    key: "image_gen.chat_moment_provider",
    group: "image_gen",
    label: "Chat moment provider",
    type: "text",
    envKey: "IMAGE_GEN_CHAT_MOMENT_PROVIDER",
    description:
      'Engine for chat moment images: "runninghub", "openai", or "mock". Empty falls back to the default provider.',
  },
  {
    key: "image_gen.scene_background_provider",
    group: "image_gen",
    label: "Scene background provider",
    type: "text",
    envKey: "IMAGE_GEN_SCENE_BACKGROUND_PROVIDER",
    description:
      'Engine for standalone scene background images: "runninghub", "openai", or "mock". Empty falls back to the default provider.',
  },
  {
    key: "image_gen.companion_cutout_provider",
    group: "image_gen",
    label: "Companion cutout provider",
    type: "text",
    envKey: "IMAGE_GEN_COMPANION_CUTOUT_PROVIDER",
    description:
      'Engine for companion cutout/matting: "runninghub", "openai", or "mock". Empty falls back to the default provider.',
  },
  {
    key: "image_gen.profile_outfit_provider",
    group: "image_gen",
    label: "Profile outfit provider",
    type: "text",
    envKey: "IMAGE_GEN_PROFILE_OUTFIT_PROVIDER",
    description:
      'Engine for profile outfit images: "runninghub", "openai", or "mock". Empty falls back to the default provider.',
  },
  {
    key: "image_gen.portrait_create_base_prompt",
    group: "image_gen",
    label: "Portrait create base prompt",
    type: "text",
    envKey: "IMAGE_GEN_PORTRAIT_CREATE_BASE_PROMPT",
    description:
      "Global style/quality preamble prepended to every portrait create prompt, across both Anime and Realistic lanes.",
  },
  {
    key: "image_gen.chat_moment_base_prompt",
    group: "image_gen",
    label: "Chat moment base prompt",
    type: "text",
    envKey: "IMAGE_GEN_CHAT_MOMENT_BASE_PROMPT",
    description:
      "Global preamble prepended to every chat moment image prompt.",
  },
  {
    key: "image_gen.openai_api_key",
    group: "image_gen",
    label: "OpenAI image API key",
    type: "secret",
    adminMode: "status_only",
    envKey: "OPENAI_API_KEY",
    description: "Used when a workflow's provider is openai. Shares the OPENAI_API_KEY env default.",
  },
  {
    key: "image_gen.openai_model",
    group: "image_gen",
    label: "OpenAI image model",
    type: "text",
    envKey: "OPENAI_IMAGE_MODEL",
    description: 'OpenAI Images model id, e.g. "gpt-image-1".',
  },
  {
    key: "image_gen.openai_image_size",
    group: "image_gen",
    label: "OpenAI image size",
    type: "text",
    envKey: "OPENAI_IMAGE_SIZE",
    description: 'OpenAI Images size, e.g. "1024x1024".',
  },
  {
    key: "image_gen.public_base_url",
    group: "image_gen",
    label: "Public base URL (signed image URLs)",
    type: "text",
    envKey: "IMAGE_GEN_PUBLIC_BASE_URL",
    description: "Public API base used to build signed source-image URLs sent to RunningHub.",
  },
  {
    key: "image_gen.runninghub_base_url",
    group: "image_gen",
    label: "RunningHub base URL",
    type: "text",
    envKey: "RUNNINGHUB_BASE_URL",
  },
  {
    key: "image_gen.api_key",
    group: "image_gen",
    label: "RunningHub API key",
    type: "secret",
    adminMode: "status_only",
    envKey: "RUNNINGHUB_API_KEY",
  },
  {
    key: "image_gen.webhook_url",
    group: "image_gen",
    label: "RunningHub webhook URL",
    type: "text",
    envKey: "RUNNINGHUB_WEBHOOK_URL",
  },
  {
    key: "image_gen.webhook_secret",
    group: "image_gen",
    label: "RunningHub webhook secret",
    type: "secret",
    adminMode: "status_only",
    envKey: "RUNNINGHUB_WEBHOOK_SECRET",
  },
  {
    key: "image_gen.r2_signing_key",
    group: "image_gen",
    label: "R2 signing key",
    type: "secret",
    adminMode: "status_only",
    envKey: "R2_SIGNING_KEY",
    description: "HMAC key used to sign source-image URLs handed to RunningHub.",
  },
  {
    key: "image_gen.workflows",
    group: "image_gen",
    label: "Legacy workflow fallback JSON",
    type: "json",
    description:
      "Legacy RunningHub fallback JSON for pre-catalog runtimes. Use Portrait generation's checkpoint catalog and workflow catalog for normal edits; config sync writes this only as a compatibility fallback.",
  },

  // --- llm ---
  {
    key: "llm.deepseek_api_key",
    group: "llm",
    label: "DeepSeek API key",
    type: "secret",
    adminMode: "status_only",
    envKey: "DEEPSEEK_API_KEY",
  },
  {
    key: "llm.openai_api_key",
    group: "llm",
    label: "OpenAI API key",
    type: "secret",
    adminMode: "status_only",
    envKey: "OPENAI_API_KEY",
  },
  {
    key: "llm.doubao_api_key",
    group: "llm",
    label: "Doubao (Volcano ARK) API key",
    type: "secret",
    adminMode: "status_only",
    envKey: "ARK_API_KEY",
  },
  {
    key: "llm.minimax_api_key",
    group: "llm",
    label: "MiniMax API key",
    type: "secret",
    adminMode: "status_only",
    envKey: "MINIMAX_API_KEY",
    description: "Used by the MiniMax provider for MiniMax-M3 chat via https://api.minimaxi.com/v1.",
  },

  // --- limits ---
  {
    key: "limits.rate_limit_per_minute",
    group: "limits",
    label: "API rate limit / minute",
    type: "number",
    envKey: "RATE_LIMIT_PER_MINUTE",
  },
  {
    key: "limits.request_body_bytes",
    group: "limits",
    label: "Request body limit bytes",
    type: "number",
    envKey: "REQUEST_BODY_LIMIT_BYTES",
    dangerLevel: "high",
  },
  {
    key: "limits.asset_upload_body_bytes",
    group: "limits",
    label: "Asset upload body limit bytes",
    type: "number",
    envKey: "ASSET_UPLOAD_BODY_LIMIT_BYTES",
    dangerLevel: "high",
  },
  {
    key: "limits.stripe_webhook_body_bytes",
    group: "limits",
    label: "Stripe webhook body limit bytes",
    type: "number",
    envKey: "STRIPE_WEBHOOK_BODY_LIMIT_BYTES",
    dangerLevel: "high",
  },
  {
    key: "limits.llm_rate_limit_per_minute",
    group: "limits",
    label: "LLM rate limit / minute",
    type: "number",
    envKey: "LLM_RATE_LIMIT_PER_MINUTE",
  },

  // --- email ---
  {
    key: "email.provider_api_key",
    group: "email",
    label: "Email provider API key (Resend)",
    type: "secret",
    adminMode: "status_only",
    envKey: "EMAIL_PROVIDER_API_KEY",
  },
  {
    key: "email.from_address",
    group: "email",
    label: "Email from address",
    type: "text",
    envKey: "EMAIL_FROM_ADDRESS",
  },
] as const;

export const SETTINGS_BY_KEY: Record<string, SettingDef> = Object.fromEntries(
  SETTINGS.map((s) => [s.key, s]),
);

export const SETTING_GROUPS: readonly SettingGroup[] = [
  "auth",
  "billing",
  "credits",
  "image_gen",
  "llm",
  "limits",
  "email",
];

export function isSecret(key: string): boolean {
  return SETTINGS_BY_KEY[key]?.type === "secret";
}

export function adminModeFor(def: SettingDef | undefined): SettingAdminMode {
  return def?.adminMode ?? "editable";
}
