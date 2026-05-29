export type RelationshipDimensionKey =
  | 'closeness'
  | 'trust'
  | 'romance'
  | 'friendship'
  | 'hostility'
  | 'tension'
  | 'distance';

export type RelationshipDimensions = Record<RelationshipDimensionKey, number>;

export type RelationshipSummary = {
  dimensions: RelationshipDimensions;
  first_met_at: number | null;
  last_interaction_at: number | null;
  level: string;
  milestones?: unknown[];
  next_goal?: string | null;
  recommended_activity?: ActivityType | null;
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
};

export type ArtStyle = 'realistic' | 'anime_jp' | 'anime_kr';

export type BaseArtJobStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled';

export type BaseArtGenerateInput = {
  source: 'text' | 'upload';
  style: ArtStyle;
  prompt?: string;
  upload_key?: string;
};

export type BaseArtGenerateResponse = {
  job_id: string;
  status: 'queued';
};

export type BaseArtJobResponse = {
  status: BaseArtJobStatus;
  art_key?: string;
  error_code?: string;
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

export type AsyncState<T> =
  | { status: 'idle' | 'loading' }
  | { data: T; status: 'ready' }
  | { message: string; status: 'error' };
