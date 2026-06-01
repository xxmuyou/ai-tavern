export type RelationshipDimensionKey =
  | 'closeness'
  | 'trust'
  | 'romance'
  | 'friendship'
  | 'hostility'
  | 'tension'
  | 'distance';

export type RelationshipDimensions = Record<RelationshipDimensionKey, number>;

export type RelationshipNextGoalWire =
  | string
  | {
      description?: string | null;
      target_dim?: RelationshipDimensionKey | null;
      target_value?: number | null;
    };

export type RecommendedActivityWire =
  | ActivityType
  | {
      activity_type?: ActivityType | null;
      reason?: string | null;
    };

export type RelationshipSummary = {
  dimensions: RelationshipDimensions;
  first_met_at: number | null;
  last_interaction_at: number | null;
  level: string;
  milestones?: unknown[];
  next_goal?: RelationshipNextGoalWire | null;
  recommended_activity?: RecommendedActivityWire | null;
  stage?: string | null;
  stage_progress?: number | null;
};

export type CompanionSource = 'official' | 'user';

export type Gender = 'male' | 'female';

export type RomancePreference = Gender | 'any';

export type TimeSlot = 'morning' | 'afternoon' | 'evening' | 'night';

export type ActivityType = 'check_in' | 'hang_out' | 'invite' | 'date' | 'gift' | 'repair';

export type ActivityStatus = 'active' | 'completed' | 'canceled';

export type Availability = 'available' | 'busy' | 'away';

export type MemoryType =
  | 'first_meeting'
  | 'first_hangout'
  | 'first_date'
  | 'gift_received'
  | 'confession'
  | 'repair'
  | 'anniversary';

export type City = {
  description?: string;
  name: string;
  tagline?: string;
  timezone?: string | null;
};

export type SceneRef = {
  art_url: string | null;
  id: string;
  mood?: string | null;
  name: string;
};

export type RelationshipGoal = {
  label: string;
  recommended_activity?: ActivityType | null;
  stage: string;
  stage_progress: number;
};

export type DailyState = {
  activity_hint: string;
  availability: Availability;
  companion_id: string;
  date_local: string;
  flavor_text?: string | null;
  mood: string;
  scene: SceneRef;
  time_slot: TimeSlot;
};

export type TodayRecommendation = {
  activity_hint: string;
  availability: Availability;
  companion: {
    art_url: string | null;
    id: string;
    name: string;
    relationship_role: string | null;
  };
  daily_state: DailyState;
  mood: string;
  next_goal: RelationshipGoal;
  scene: SceneRef;
  suggested_activity: ActivityType;
};

export type TodayResponse = {
  city: City;
  date_local: string;
  recommendations: TodayRecommendation[];
  time_slot: TimeSlot;
};

export type ActivityContext = {
  companion: {
    art_url: string | null;
    id: string;
    name: string;
  };
  created_at: string;
  daily_state: DailyState;
  id: string;
  scene: SceneRef;
  status: ActivityStatus;
  type: ActivityType;
};

export type ActivityCreateInput = {
  companion_id: string;
  scene_id?: string;
  type: ActivityType;
};

export type ActivityResponse = {
  activity: ActivityContext;
};

export type Memory = {
  cg_template: string | null;
  cg_url: string | null;
  companion_id: string;
  created_at: string;
  date: string;
  id: string;
  key_choice: string | null;
  relationship_delta: string | null;
  scene: SceneRef | null;
  summary: string;
  title: string;
  type: MemoryType;
};

export type MemoriesResponse = {
  album_limit: number | null;
  items: Memory[];
  tier: 'free' | 'pro';
};

export type PushPreferenceResponse = {
  enabled: boolean;
};

export type CompanionListItem = {
  art_url: string | null;
  current_level: string | null;
  gender: Gender | null;
  id: string;
  last_interaction_at: number | null;
  name: string;
  preferred_scenes: string[];
  relationship_role: string | null;
  source: CompanionSource;
};

export type ChatEmotionKey =
  | 'warm'
  | 'neutral'
  | 'guarded'
  | 'playful'
  | 'tense'
  | 'annoyed';

export type NonNeutralChatEmotionKey = Exclude<ChatEmotionKey, 'neutral'>;

export type CompanionDetail = {
  appearance: string | null;
  art_emotions: Partial<Record<ChatEmotionKey, string>> | null;
  art_url: string | null;
  background: string | null;
  gender: Gender | null;
  id: string;
  name: string;
  personality: string | null;
  preferred_scenes: string[];
  relationship: RelationshipSummary;
  relationship_role: string | null;
  source: CompanionSource;
  speech_style: string | null;
  // spec-025 persona fields. Only present for the owner of a user-created
  // companion (the backend hides them otherwise).
  want?: string | null;
  secret?: string | null;
  boundary?: string | null;
};

export type CompanionCreateInput = {
  appearance?: string;
  art_url: string;
  background?: string;
  gender: Gender;
  name: string;
  personality?: string;
  preferred_scenes?: string[];
  relationship_role?: string;
  speech_style?: string;
  // spec-025 persona depth
  want?: string;
  secret?: string;
  boundary?: string;
};

// spec-025: a single unlock surfaced over the chat SSE `unlocks` event.
export type ChatUnlock = {
  key: string;
  kind: 'secret' | 'expression' | 'title';
  label: string;
};

export type RelationshipUnlockItem = {
  key: string;
  kind: 'secret' | 'expression' | 'title';
  label: string;
  required_stage: string;
  unlocked: boolean;
};

export type RelationshipSceneUnlock = {
  id: string;
  name: string;
  unlocked: boolean;
  hint: string | null;
};

export type RelationshipUnlocksResponse = {
  companion_id: string;
  stage: string;
  is_pro: boolean;
  is_owner: boolean;
  secret: string | null;
  secret_unlocked: boolean;
  items: RelationshipUnlockItem[];
  scenes: RelationshipSceneUnlock[];
};

export type ArtStyle = 'realistic' | 'anime_jp' | 'anime_kr';

export type BaseArtJobStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled';

export type BaseArtGenerateInput = {
  source: 'text' | 'upload';
  model?: string;
  style?: ArtStyle;
  prompt?: string;
  upload_key?: string;
};

export type ImageModelOption = {
  id: string;
  label: string;
  style_tag: ArtStyle;
};

export type ImageModelsResponse = {
  models: ImageModelOption[];
};

export type BaseArtGenerateResponse = {
  job_id: string;
  status: 'queued';
};

export type BaseArtJobResponse = {
  status: BaseArtJobStatus;
  art_key?: string;
  error_code?: string;
  /** Raw provider failure detail (e.g. RunningHub message), surfaced for debugging. */
  error_message?: string;
};

export type BaseArtPromptAssistResponse = {
  fallback?: boolean;
  prompt: string;
};

export type UserImageAsset = {
  art_key: string;
  created_at: number;
  id: string;
  model_id: string | null;
  prompt: string | null;
  source: 'generated' | 'upload';
};

export type UserImageAssetsResponse = {
  assets: UserImageAsset[];
};

export type UserImageAssetCreateInput = {
  art_key: string;
  model_id?: string;
  prompt?: string;
  source: 'generated' | 'upload';
};

export type EmotionArtJobStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled';

export type EmotionArtJob = {
  completed_at: number | null;
  created_at: number;
  emotion: NonNeutralChatEmotionKey;
  error_code: string | null;
  error_message: string | null;
  external_task_id: string | null;
  id: string;
  output_key: string | null;
  provider: string | null;
  source_art_url: string;
  status: EmotionArtJobStatus;
  updated_at: number;
};

export type EmotionArtGenerateResponse =
  | { key: string; status: 'cached' }
  | { job_id: string; reused: boolean; status: 'queued' };

export type EmotionArtJobsResponse = {
  jobs: EmotionArtJob[];
};

export type CompanionsListResponse = {
  items: CompanionListItem[];
};

export type CompanionDetailResponse = CompanionDetail;

export type RelationshipResponse = {
  companion_id: string;
  dimensions: RelationshipDimensions;
  first_met_at: number | null;
  last_interaction_at: number | null;
  level: string;
  milestones: unknown[];
  next_goal?: RelationshipNextGoalWire | null;
  recommended_activity?: RecommendedActivityWire | null;
  stage?: string | null;
  stage_progress?: number | null;
};

export type SceneUnlockHint = {
  companion_id?: string;
  dimension?: RelationshipDimensionKey;
  label?: string;
  value?: number;
};

export type SceneCompanionPreview = {
  art_url: string | null;
  id: string;
  level: string | null;
  name: string;
};

export type Scene = {
  art_url: string | null;
  id: string;
  mood: string;
  name: string;
  potential_companions: SceneCompanionPreview[];
  tags: string[];
  unlock_hint?: SceneUnlockHint | string | null;
  unlocked: boolean;
};

export type ScenesListResponse = {
  scenes: Scene[];
};

export type SceneEntered = {
  art_url: string | null;
  id: string;
  mood: string;
  name: string;
  tags: string[];
};

export type SceneCompanionPresent = {
  art_url: string | null;
  id: string;
  name: string;
  opener: string;
};

export type SceneEnterResponse = {
  companions_present: SceneCompanionPresent[];
  event: unknown | null;
  scene: SceneEntered;
};

export type ChatMessage = {
  companion_id?: string;
  content: string;
  created_at: string;
  emotion?: string | null;
  id: string;
  role: 'user' | 'companion' | 'assistant';
};

export type ChatHistoryResponse = {
  messages: ChatMessage[];
  next_cursor: string | null;
};

export type ChatMessageInput = {
  activity_id?: string;
  scene_id?: string;
  text: string;
};

export type SseEvent = {
  data: unknown;
  type: string;
};

export type BillingStatusResponse = {
  entitlements: {
    custom_companion_limit: number | null;
    message_limit_daily: number | null;
    subscriber_soft_message_threshold_daily: number | null;
    tier: 'free' | 'pro';
  };
  subscription: {
    cancel_at_period_end: boolean;
    current_period_end: number | null;
    price_id: string | null;
    status: string;
    tier: 'free' | 'pro';
  };
  usage: {
    date_utc: string;
    message_limit_daily: number | null;
    messages_used_today: number;
    subscriber_soft_threshold_exceeded: boolean;
  };
};

export type CreditPackageId = 'small' | 'medium' | 'large';

export type CreditLedgerType =
  | 'grant_monthly'
  | 'purchase'
  | 'reserve'
  | 'commit'
  | 'release'
  | 'refund'
  | 'expire'
  | 'adjustment';

export type CreditMonthlyGrant = {
  amount: number;
  granted: boolean;
  period: string;
  tier: 'free' | 'pro';
};

export type CreditBalanceResponse = {
  available_credits: number;
  monthly_grant: CreditMonthlyGrant | null;
  reserved_credits: number;
};

export type CreditLedgerEntry = {
  amount: number;
  balance_after: number | null;
  created_at: number;
  expires_at: number | null;
  id: string;
  metadata: Record<string, unknown> | null;
  reference_id: string | null;
  reference_type: string | null;
  reserved_after: number | null;
  task_type: string | null;
  type: CreditLedgerType;
};

export type CreditLedgerResponse = {
  entries: CreditLedgerEntry[];
};

export type MeQuota = {
  message_limit_daily?: number | null;
  messages_limit_today?: number | null;
  messages_used_today: number;
  subscriber_soft_threshold_exceeded?: boolean;
};

export type MeSubscription = {
  cancel_at_period_end?: boolean;
  current_period_end: number | null;
  price_id?: string | null;
  status: string;
  tier: 'free' | 'pro';
};

export type MeResponse = {
  display_name: string | null;
  email: string;
  email_verified: boolean;
  id: string;
  is_admin?: boolean;
  linked_providers: string[];
  push_enabled: boolean;
  quota: MeQuota;
  romance_preference: RomancePreference;
  subscription: MeSubscription;
  timezone: string | null;
};

export type AdminAllowlistItem = {
  created_at: string | null;
  created_by: string | null;
  created_by_email: string | null;
  email: string;
  note: string | null;
  source: 'builtin' | 'custom';
};

export type AdminAllowlistResponse = {
  emails: AdminAllowlistItem[];
};

export type AdminUserTier = 'free' | 'pro';

export type AdminUserSummary = {
  email: string;
  tier: AdminUserTier;
  user_id: string;
};

export type AdminUsersResponse = {
  users: AdminUserSummary[];
};

export type AdminLedgerEntry = {
  amount: number;
  balance_after: number;
  created_at: string;
  id: string;
  reason: string | null;
  type: string;
};

export type AdminUserCredits = {
  available_credits: number;
  recent_ledger: AdminLedgerEntry[];
  reserved_credits: number;
  user_id: string;
};

export type AdminCreditAdjustmentResult = {
  available_credits: number;
  entry: AdminLedgerEntry;
  user_id: string;
};

export type LlmProvider = 'anthropic' | 'cloudflare' | 'deepseek' | 'doubao' | 'openai';

export type LlmConfigItem = {
  fallback_model: string | null;
  fallback_provider: LlmProvider | null;
  model: string;
  provider: LlmProvider;
  task: string;
  updated_at: string;
  updated_by: string | null;
};

export type LlmConfigResponse = {
  tasks: LlmConfigItem[];
};

export type LlmConfigUpdateInput = {
  fallback_model?: string | null;
  fallback_provider?: LlmProvider | null;
  model: string;
  provider: LlmProvider;
};

export type LlmTestInput = {
  model?: string;
  prompt: string;
  provider?: LlmProvider;
  task: string;
};

export type LlmTestResult =
  | {
      cost_usd: number;
      latency_ms: number;
      model: string;
      ok: true;
      provider: string;
      text: string;
      tokens: { input: number; output: number };
    }
  | {
      error_code: string;
      error_message: string;
      latency_ms: number;
      model: string;
      ok: false;
      provider: string;
    };

export type LlmUsageWindow = '7d' | '30d' | 'today';

export type LlmUsageTotals = {
  calls: number;
  cost_usd: number;
  error_calls: number;
  token_input: number;
  token_output: number;
};

export type LlmUsageByTaskProvider = LlmUsageTotals & {
  provider: string;
  task: string;
};

export type LlmUsageResponse = {
  by_task_provider: LlmUsageByTaskProvider[];
  from: string;
  to: string;
  totals: LlmUsageTotals;
  window: LlmUsageWindow;
};

// --- Admin: WF1 model catalog ---
export type AdminImageModel = {
  id: string;
  label: string;
  style_tag: ArtStyle;
  ckpt_name: string;
  is_active: boolean;
  sort_order: number;
  updated_at: number;
  updated_by_email: string | null;
  /**
   * False when this model's style has no checkpoint node configured in the WF1
   * create workflows, so its ckpt_name is ignored at generation time (falls back
   * to the workflow's built-in checkpoint).
   */
  checkpoint_applies: boolean;
};

export type AdminImageModelsResponse = {
  models: AdminImageModel[];
};

// --- Admin: image generation job diagnostics ---
export type AdminImageGenJob = {
  id: string;
  status: BaseArtJobStatus;
  task: string;
  style: string | null;
  model: string | null;
  provider: string | null;
  error_code: string | null;
  error_message: string | null;
  provider_task_id: string | null;
  created_at: number;
  completed_at: number | null;
};

export type AdminImageGenJobsResponse = {
  jobs: AdminImageGenJob[];
};

export type ImageModelInput = {
  label: string;
  style_tag: ArtStyle;
  ckpt_name: string;
  is_active: boolean;
  sort_order: number;
};

// --- Admin: WF2 expression prompts (gender × emotion) ---
export type ExpressionGender = 'male' | 'female';

export type ExpressionPromptItem = {
  gender: ExpressionGender;
  emotion: string;
  prompt: string;
  updated_at: number;
  updated_by_email: string | null;
};

export type ExpressionPromptsResponse = {
  prompts: ExpressionPromptItem[];
};

export type AdminSettingType = 'text' | 'number' | 'boolean' | 'secret' | 'json';

export type AdminSettingItem = {
  key: string;
  admin_mode: 'editable' | 'status_only';
  danger_level: 'normal' | 'high';
  env_key: string | null;
  group: string;
  label: string;
  type: AdminSettingType;
  description: string | null;
  source: 'db' | 'env' | 'derived' | 'unset';
  is_set: boolean;
  updated_at: number | null;
  updated_by: string | null;
  // Absent for secrets (never returned by the backend).
  value?: string | null;
};

export type AdminSettingsResponse = {
  groups: string[];
  settings: AdminSettingItem[];
};

export type AdminSecretRevealResponse = {
  env_key: string | null;
  key: string;
  source: 'db' | 'env' | 'derived' | 'unset';
  value: string | null;
};

export type AsyncState<T> =
  | { status: 'idle' | 'loading' }
  | { data: T; status: 'ready' }
  | { message: string; status: 'error' };
