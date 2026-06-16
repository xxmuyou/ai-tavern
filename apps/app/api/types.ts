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

export type VoiceSpeed = 'slow' | 'medium' | 'fast';

export type VoiceGenderHint = Gender | 'neutral';

export type VoiceOption = {
  display_label?: string;
  display_language_label?: string;
  gender_hint?: VoiceGenderHint;
  id: string;
  label: string;
  language: string;
  language_label: string;
};

export type VoiceSpeedPreset = {
  id: VoiceSpeed;
  label: string;
  value: number;
};

export type VoiceOptionsResponse = {
  defaults: {
    female_voice_id: string;
    male_voice_id: string;
    speed: VoiceSpeed;
  };
  provider: 'minimax';
  speed_presets: VoiceSpeedPreset[];
  voices: VoiceOption[];
};

export type VoicePreviewResponse = {
  url: string;
};

export type ChatVoiceSettingsResponse = {
  source: 'user' | 'companion' | 'default';
  voice_id: string;
  voice_speed: VoiceSpeed;
};

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

export type EventType = 'invitation' | 'conflict' | 'gift' | 'confession' | 'milestone';

export type EventOption = {
  id: string;
  label: string;
};

export type EventResponseItem = {
  companion_id: string;
  created_at: number;
  event_type: EventType;
  id: string;
  payload: {
    description: string;
    options: EventOption[];
  };
  scene_id: string | null;
};

export type EventsListResponse = {
  events: EventResponseItem[];
};

export type EventResolveResponse = {
  level_changed: string | null;
  result: {
    description: string;
    signals: Partial<RelationshipDimensions>;
  };
  unlocks: ChatUnlock[];
};

export type Memory = {
  cg_template: string | null;
  cg_url: string | null;
  companion?: {
    art_url: string | null;
    id: string;
    name: string;
  } | null;
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
  art_cutout_url?: string | null;
  art_url: string | null;
  current_level: string | null;
  gender: Gender | null;
  id: string;
  is_public: boolean;
  is_favorite: boolean;
  favorite_count: number;
  last_interaction_at: number | null;
  name: string;
  play_count: number;
  preferred_scenes: string[];
  tags: string[];
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

export type ChatMode = 'talk' | 'story';

export type CompanionDetail = {
  appearance: string | null;
  art_emotions: Partial<Record<ChatEmotionKey, string>> | null;
  art_cutout_url?: string | null;
  art_url: string | null;
  background: string | null;
  canonical_art_url?: string | null;
  favorite_count?: number;
  gender: Gender | null;
  id: string;
  is_favorite?: boolean;
  is_public?: boolean;
  name: string;
  personality: string | null;
  preferred_scenes: string[];
  relationship: RelationshipSummary;
  relationship_role: string | null;
  source: CompanionSource;
  speech_style: string | null;
  voice_id?: string | null;
  voice_speed?: VoiceSpeed | null;
  // The character's opening line; used as an intro hint, not stored as chat history.
  greeting?: string | null;
  // spec-025 persona fields. Only present for the owner of a user-created
  // companion (the backend hides them otherwise).
  want?: string | null;
  secret?: string | null;
  boundary?: string | null;
  // Sample lines in the character's voice (few-shot). Owner-only.
  example_dialogues?: string[];
  tags?: string[];
  play_count?: number;
  profile_image_override?: string | null;
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
  greeting?: string;
  example_dialogues?: string[];
  tags?: string[];
  // spec-025 persona depth
  want?: string;
  secret?: string;
  boundary?: string;
};

// spec-025: a single unlock surfaced over the chat SSE `unlocks` event.
export type ChatUnlock = {
  key: string;
  kind: 'secret' | 'expression' | 'title' | 'scene';
  label: string;
  scene_id?: string;
  scene_name?: string;
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

export type CompanionCutoutStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled';

export type CompanionCutoutResponse = {
  companion_id: string;
  status: CompanionCutoutStatus;
  art_cutout_url: string | null;
  job_id: string | null;
  error_code: string | null;
  error_message: string | null;
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

export type BaseArtJobStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled';

export type BaseArtGenerateInput = {
  source: 'text' | 'upload';
  batch_size?: number;
  lora_id?: string | null;
  model?: string;
  prompt?: string;
  seed?: number | null;
  size_preset?: string;
  upload_key?: string;
};

export type ImageSizePreset = {
  id: string;
  label: string;
  width: number;
  height: number;
};

export type WorkflowGenerationControls = {
  sizePresets: ImageSizePreset[];
  defaultSizePresetId: string;
  latentNodeId?: string;
  widthFieldName?: string;
  heightFieldName?: string;
  batchSizeFieldName?: string;
  ksamplerNodeId?: string;
  seedFieldName?: string;
  batchSizeDefault: number;
  batchSizeMin: number;
  batchSizeMax: number;
};

export type ImageModelLoraOption = {
  id: string;
  label: string;
  lora_name: string;
  model_strength: number;
  clip_strength: number | null;
};

export type ImageModelOption = {
  checkpoint_applies?: boolean;
  ckpt_name?: string;
  generation_controls?: WorkflowGenerationControls | null;
  id: string;
  label: string;
  loras?: ImageModelLoraOption[];
  model_id?: string;
  tag: string;
  workflow_key?: string;
  workflow_label?: string;
};

export type ImageStylePreset = {
  default_model: string;
  id: 'realistic' | 'anime';
  label: string;
};

export type ImageModelsResponse = {
  models: ImageModelOption[];
  style_presets?: ImageStylePreset[];
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
  art_cutout_url?: string | null;
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

export type StoryBeatStatus = 'active' | 'waiting_stage' | 'completed';
export type StoryArcSourceType = 'official_seed' | 'template' | 'user_written' | 'ai_assisted';
export type StoryBeatCompletionMode = 'manual' | 'auto';

export type StoryBeat = {
  arc_id?: string | null;
  beat_order: number;
  completion_mode?: StoryBeatCompletionMode;
  id: string;
  is_user_editable?: boolean;
  objective: string;
  opener: string;
  reward_unlock_key: string | null;
  scene_id: string | null;
  source_type?: StoryArcSourceType;
  stage_gate: string;
  status: StoryBeatStatus;
  title: string;
};

export type StoryTransitionMode = 'stay' | 'offstage' | 'scene';

export type StorySceneTarget = {
  art_url: string | null;
  id: string;
  mood: string;
  name: string;
};

export type StoryChoice = {
  id: string;
  label: string;
  intent: string;
  user_narration: string;
  result_narration: string;
  scene_hint: string | null;
  target_scene_id: string | null;
  transition_mode: StoryTransitionMode;
  completes_beat: boolean;
};

export type StoryMoment = {
  beat_id: string;
  title: string;
  arrival_narration: string;
  objective: string;
  choices: StoryChoice[];
};

export type StoryMomentResponse = {
  story_moment: StoryMoment | null;
};

export type StoryChoiceResolveResponse = {
  completed_beat: StoryBeat | null;
  result_narration: string;
  target_scene: StorySceneTarget | null;
  transition_mode: StoryTransitionMode;
  unlocks: ChatUnlock[];
};

export type StoryBeatDraft = {
  objective: string;
  opener: string;
  scene_hint?: string | null;
  scene_id?: string | null;
  stage_gate: string;
  title: string;
};

export type StoryArc = {
  beats: StoryBeat[];
  companion_id: string;
  created_at: number;
  id: string;
  is_active: boolean;
  outline: string | null;
  owner_user_id: string | null;
  shared_with_public: boolean;
  source_type: StoryArcSourceType;
  template_id: string | null;
  title: string;
  updated_at: number;
};

export type StoryArcTemplate = {
  beats: StoryBeatDraft[];
  description: string;
  id: string;
  relationship_role: string | null;
  title: string;
};

export type StoryArcTemplatesResponse = {
  templates: StoryArcTemplate[];
};

export type StoryArcsResponse = {
  arcs: StoryArc[];
};

export type StoryArcCreateInput = {
  beats: StoryBeatDraft[];
  outline?: string;
  source_type?: 'user_written' | 'ai_assisted';
  template_id?: string;
  title: string;
};

export type StoryArcAssistInput = {
  beat_count?: number;
  outline?: string;
  template_id?: string;
};

export type StoryArcAssistResponse = {
  draft: {
    arc_title: string;
    beats: StoryBeatDraft[];
    outline: string | null;
    source_type: 'ai_assisted';
    template_id: string | null;
  };
};

export type StoryBeatUpdateInput = Partial<Pick<StoryBeatDraft, 'objective' | 'opener' | 'scene_id' | 'stage_gate' | 'title'>> & {
  beat_order?: number;
};

export type StoryBeatResponse = {
  beat: StoryBeat;
};

export type SceneStorySourceType = 'official_preset' | 'user_written' | 'ai_assisted';
export type SceneStoryTaskStatus = 'locked' | 'active' | 'completed';

export type SceneStoryTask = {
  ai_guidance: string;
  completion_hint: string | null;
  id: string;
  objective: string;
  order: number;
  status: SceneStoryTaskStatus;
  title: string;
};

export type SceneStory = {
  can_edit: boolean;
  current_task: SceneStoryTask | null;
  id: string;
  progress_percent: number;
  scene_id: string;
  source_type: SceneStorySourceType;
  synopsis: string | null;
  task_count: number;
  tasks?: SceneStoryTask[];
  title: string;
};

export type SceneStoriesResponse = {
  stories: SceneStory[];
};

export type SceneStoryResponse = {
  story: SceneStory;
};

export type SceneStoryTaskInput = {
  ai_guidance: string;
  completion_hint?: string | null;
  objective: string;
  title: string;
};

export type SceneStoryInput = {
  synopsis?: string | null;
  tasks: SceneStoryTaskInput[];
  title: string;
};

export type SceneStoryUpdateInput = {
  synopsis?: string | null;
  tasks?: SceneStoryTaskInput[];
  title?: string;
};

export type SceneStoryInviteCompanion = {
  art_url: string | null;
  id: string;
  level: string | null;
  name: string;
  relationship_role: string | null;
  source: CompanionSource;
};

export type SceneStoryInviteCompanionsResponse = {
  companions: SceneStoryInviteCompanion[];
};

export type SceneStoryInviteResponse = {
  accepted: boolean;
  chat: null | {
    chat_mode: 'story';
    companion_id: string;
    scene_id: string;
    story_id: string;
  };
  reason: string;
  reply: string;
  story: SceneStory;
};

export type SceneCompanionPresent = {
  active_story_beat: StoryBeat | null;
  art_cutout_url?: string | null;
  art_url: string | null;
  id: string;
  name: string;
  opener: string;
  story_moment?: StoryMoment | null;
};

export type SceneEnterResponse = {
  companions_present: SceneCompanionPresent[];
  event: EventResponseItem | null;
  scene: SceneEntered;
};

export type MomentImageStatus =
  | 'queued'
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type ChatMomentImage = {
  job_id: string;
  status: MomentImageStatus;
  output_key: string | null;
};

export type CompanionMomentImage = {
  id: string;
  job_id: string;
  message_id: string;
  status: MomentImageStatus;
  output_key: string | null;
  created_at: number;
  updated_at: number;
};

export type CompanionMomentImagesResponse = {
  moment_images: CompanionMomentImage[];
};

export type ChatOutfitImage = {
  job_id: string;
  status: MomentImageStatus;
  output_key: string | null;
};

export type ChatMessage = {
  companion_id?: string;
  content: string;
  created_at: string;
  emotion?: string | null;
  id: string;
  moment_image?: ChatMomentImage | null;
  outfit_image?: ChatOutfitImage | null;
  role: 'user' | 'companion' | 'assistant';
  scene_id?: string | null;
  // Alternative wordings the user can swipe between (regenerate). Null/absent =
  // a single-version message. selected_variant indexes into variants.
  variants?: string[] | null;
  selected_variant?: number | null;
};

export type SelectVariantResponse = {
  id: string;
  content: string;
  selected_variant: number;
  variants: string[];
};

export type EditMessageResponse = {
  edited_message_id: string;
  message_id: string;
  reply: string;
  emotion: string;
  signals: Record<string, number>;
  unlocks: unknown[];
};

export type MomentImageJobResponse = {
  job_id: string;
  moment_id?: string;
  status: MomentImageStatus;
  output_key?: string;
  error_code?: string;
  error_message?: string;
};

export type OutfitRecommendation = {
  id: string;
  prompt: string;
  title: string;
};

export type OutfitRecommendationsResponse = {
  recommendations: OutfitRecommendation[];
};

export type OutfitImageGenerateInput =
  | { source: 'recommended'; recommendation_id: string }
  | { source: 'custom'; prompt: string };

export type OutfitImageJobResponse = {
  job_id: string;
  outfit_id?: string;
  status: MomentImageStatus;
  output_key?: string;
  error_code?: string;
  error_message?: string;
};

export type ProfileOutfitImageJobResponse = {
  generation_id?: string;
  job_id: string;
  status: MomentImageStatus;
  output_key?: string;
  error_code?: string;
  error_message?: string;
};

export type LatestProfileOutfitImageResponse = {
  generation: ProfileOutfitImageJobResponse | null;
};

export type ProfileImageResponse = {
  art_url?: string | null;
  companion_id: string;
  generation_id?: string;
  profile_image_override: string | null;
};

export type ChatHistoryResponse = {
  messages: ChatMessage[];
  next_cursor: string | null;
};

export type ChatMessageInput = {
  activity_id?: string;
  chat_mode?: ChatMode;
  story_id?: string;
  scene_id?: string;
  persona_id?: string;
  // spec-036: when set, this turn carries an invitation to go to that scene.
  invite_scene_id?: string;
  quick_action?:
    | { type: 'gift'; item_id: 'coffee' | 'flowers' }
    | { type: 'scene_action'; action_id: string }
    | { type: 'custom_scene_action'; text: string };
  text: string;
};

// spec-036: a candidate destination for an in-chat "invite to go somewhere".
export type InviteTarget = {
  id: string;
  name: string;
  mood: string;
  art_url: string | null;
};

export type InviteTargetsResponse = {
  targets: InviteTarget[];
};

// spec-038: SSE `invite_result` payload only records whether the companion
// agreed. Web asks the user to arrive now/later before switching scenes.
export type ChatInviteResult = {
  accepted: boolean;
  activity_completed?: boolean;
  reason: string;
  scene_id: string | null;
  scene_art_url: string | null;
};

export type ChatQuickActionResult = {
  activity_id: string | null;
  cooldown_until: number | null;
  item_id: string;
  memory_id: string | null;
  ok: boolean;
};

// A user-authored "who I am" identity injected into the chat prompt so the
// companion knows who it is talking to.
export type Persona = {
  id: string;
  name: string;
  description: string | null;
  gender: string | null;
  is_default: boolean;
  created_at: number;
  updated_at: number;
};

export type PersonasResponse = {
  personas: Persona[];
};

export type PersonaResponse = {
  persona: Persona | null;
};

export type PersonaInput = {
  name: string;
  description?: string | null;
  gender?: string | null;
  is_default?: boolean;
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

export type AdminAnalyticsWindow = '7d' | '30d' | 'today';

export type AdminAnalyticsUser = {
  created_at: string;
  email: string;
  last_seen_at: string;
  subscription_status: string | null;
  tier: AdminUserTier;
  user_id: string;
};

export type AdminAnalyticsSummary = {
  active_subscriptions: number;
  active_users: number;
  credits_revenue_usd: number;
  free_users: number;
  gross_revenue_usd: number;
  new_users: number;
  pro_users: number;
  subscription_revenue_usd: number;
  total_users: number;
};

export type AdminAnalyticsTierBreakdownItem = {
  count: number;
  tier: AdminUserTier;
};

export type AdminAnalyticsSubscriptionStatusItem = {
  count: number;
  status: string;
};

export type AdminAnalyticsSignupPoint = {
  date_utc: string;
  users: number;
};

export type AdminAnalyticsRevenuePoint = {
  credits_revenue_usd: number;
  date_utc: string;
  gross_revenue_usd: number;
  subscription_revenue_usd: number;
};

export type AdminAnalyticsRevenueStatus = {
  available: boolean;
  message: string | null;
};

export type AdminAnalyticsOverviewResponse = {
  from: string;
  recent_signups: AdminAnalyticsUser[];
  revenue_by_day: AdminAnalyticsRevenuePoint[];
  revenue_status: AdminAnalyticsRevenueStatus;
  signups_by_day: AdminAnalyticsSignupPoint[];
  subscription_status_breakdown: AdminAnalyticsSubscriptionStatusItem[];
  summary: AdminAnalyticsSummary;
  tier_breakdown: AdminAnalyticsTierBreakdownItem[];
  to: string;
  window: AdminAnalyticsWindow;
};

export type AdminUsersListResponse = {
  items: AdminAnalyticsUser[];
  next_cursor: string | null;
  sort: 'recent_signup';
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

export type LlmProvider = 'anthropic' | 'cloudflare' | 'deepseek' | 'doubao' | 'minimax' | 'openai';

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

// --- Admin: image model catalog ---
export type AdminImageModel = {
  id: string;
  label: string;
  tag: string;
  ckpt_name: string;
  architecture: string;
  style_family: string;
  purpose: string;
  tags: string;
  is_active: boolean;
  sort_order: number;
  updated_at: number;
  updated_by_email: string | null;
};

export type AdminImageModelsResponse = {
  models: AdminImageModel[];
};

export type AdminImageLora = {
  id: string;
  label: string;
  lora_name: string;
  architecture: string;
  style_family: string;
  purpose: string;
  tags: string;
  default_model_strength: number;
  default_clip_strength: number | null;
  is_active: boolean;
  sort_order: number;
  updated_at: number;
  updated_by_email: string | null;
};

export type AdminImageLorasResponse = {
  loras: AdminImageLora[];
};

export type ImageWorkflowLoraBinding = {
  model_id: string;
  lora_ids: string[];
};

export type AdminImageWorkflow = {
  checkpoint_field_name: string;
  checkpoint_node_id: string | null;
  contract_hash: string | null;
  contract_json: string | null;
  contract_refreshed_at: number | null;
  is_active: boolean;
  key: string;
  label: string;
  load_image_field_name: string;
  load_image_node_id: string | null;
  lora_bindings: ImageWorkflowLoraBinding[];
  lora_clip_strength_field_name: string | null;
  lora_model_strength_field_name: string;
  lora_name_field_name: string;
  lora_node_id: string | null;
  generation_params_json: string | null;
  mode: 'create' | 'variation' | 'cutout';
  model_ids: string[];
  negative_prompt_node_id: string | null;
  negative_prompt_field_name: string;
  prompt_field_name: string;
  prompt_node_id: string;
  sort_order: number;
  updated_at: number;
  updated_by_email: string | null;
  workflow_id: string;
};

export type AdminImageWorkflowsResponse = {
  workflows: AdminImageWorkflow[];
};

// --- Admin: image generation job diagnostics ---
export type AdminImageGenJob = {
  id: string;
  status: BaseArtJobStatus;
  task: string;
  workflow_key: string | null;
  model: string | null;
  provider: string | null;
  prompt_excerpt: string | null;
  error_code: string | null;
  error_message: string | null;
  provider_task_id: string | null;
  provider_submitted_at: number | null;
  provider_last_polled_at: number | null;
  provider_result_received_at: number | null;
  provider_task_cost_time_ms: number | null;
  provider_consume_coins: number | null;
  created_at: number;
  completed_at: number | null;
};

export type AdminImageGenJobsResponse = {
  jobs: AdminImageGenJob[];
};

export type ImageModelInput = {
  label: string;
  tag: string;
  ckpt_name: string;
  architecture?: string;
  style_family?: string;
  purpose?: string;
  tags?: string;
  is_active: boolean;
  sort_order: number;
};

export type ImageLoraInput = {
  label: string;
  lora_name: string;
  architecture?: string;
  style_family?: string;
  purpose?: string;
  tags?: string;
  default_model_strength: number;
  default_clip_strength: number | null;
  is_active: boolean;
  sort_order: number;
};

export type ImageWorkflowInput = {
  checkpoint_field_name: string | null;
  checkpoint_node_id: string | null;
  is_active: boolean;
  key: string;
  label: string;
  load_image_field_name: string | null;
  load_image_node_id: string | null;
  lora_bindings?: ImageWorkflowLoraBinding[];
  lora_clip_strength_field_name: string | null;
  lora_model_strength_field_name: string | null;
  lora_name_field_name: string | null;
  lora_node_id: string | null;
  generation_params_json?: string | null;
  mode: 'create' | 'variation' | 'cutout';
  model_ids: string[];
  negative_prompt_node_id: string | null;
  negative_prompt_field_name: string | null;
  prompt_field_name: string | null;
  prompt_node_id: string;
  sort_order: number;
  workflow_id: string;
};

// --- Admin: retired expression prompts (gender × emotion) ---
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
