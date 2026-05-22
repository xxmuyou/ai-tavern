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
  first_met_at: string | null;
  last_interaction_at: string | null;
  level: string;
  milestones?: unknown[];
};

export type Companion = {
  appearance?: string | null;
  avatar_url?: string | null;
  background?: string | null;
  id: string;
  is_active?: boolean;
  name: string;
  personality?: string | null;
  preferred_scenes?: string[];
  relationship?: RelationshipSummary;
  relationship_role?: string | null;
  source: 'official' | 'user';
  speech_style?: string | null;
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
  companions: Companion[];
};

export type CompanionDetailResponse = {
  companion: Companion;
  relationship: RelationshipSummary;
};

export type RelationshipResponse = {
  companion: Companion;
  relationship: RelationshipSummary;
};

export type SceneUnlockHint = {
  companion_id?: string;
  dimension?: RelationshipDimensionKey;
  label?: string;
  value?: number;
};

export type Scene = {
  banner_url?: string | null;
  default_companions?: string[];
  id: string;
  mood?: string | null;
  name?: string;
  potential_companions?: Companion[];
  summary?: string | null;
  title?: string;
  unlock_hint?: SceneUnlockHint | string | null;
  unlocked: boolean;
};

export type ScenesListResponse = {
  scenes: Scene[];
};

export type SceneEnterResponse = {
  companions_present: Companion[];
  event: unknown | null;
  scene: Scene;
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
  quota: {
    message_limit_daily: number | null;
    messages_limit_today?: number | null;
    messages_used_today: number;
    subscriber_soft_threshold_exceeded?: boolean;
  };
  subscription: {
    cancel_at_period_end?: boolean;
    current_period_end: number | null;
    status: string;
    tier: 'free' | 'pro';
  };
};

export type MeResponse = {
  display_name: string | null;
  email: string;
  email_verified: boolean;
  id: string;
  linked_providers: string[];
  quota: BillingStatusResponse['quota'];
  subscription: BillingStatusResponse['subscription'];
};

export type AsyncState<T> =
  | { status: 'idle' | 'loading' }
  | { data: T; status: 'ready' }
  | { message: string; status: 'error' };
