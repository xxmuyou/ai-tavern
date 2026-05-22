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
};

export type CompanionSource = 'official' | 'user';

export type CompanionListItem = {
  art_url: string | null;
  current_level: string | null;
  id: string;
  last_interaction_at: number | null;
  name: string;
  preferred_scenes: string[];
  relationship_role: string | null;
  source: CompanionSource;
};

export type CompanionDetail = {
  appearance: string | null;
  art_url: string | null;
  background: string | null;
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
  appearance: string;
  background: string;
  name: string;
  personality: string;
  preferred_scenes?: string[];
  relationship_role?: string;
  speech_style: string;
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
  linked_providers: string[];
  quota: MeQuota;
  subscription: MeSubscription;
};

export type AsyncState<T> =
  | { status: 'idle' | 'loading' }
  | { data: T; status: 'ready' }
  | { message: string; status: 'error' };
