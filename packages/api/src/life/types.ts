// AI Daily Life Sim v1 enum + shape definitions.
//
// This file is the single source of truth for the enums used across the
// life-sim backend (city/time, daily state, activities, memories, stages,
// push). The shared package re-exports these so the @xtbit/app frontend
// can import them without depending on packages/api internals.

export const TIME_SLOTS = ["morning", "afternoon", "evening", "night"] as const;
export type TimeSlot = (typeof TIME_SLOTS)[number];

export const MOODS = ["calm", "busy", "lonely", "playful", "guarded", "tired"] as const;
export type Mood = (typeof MOODS)[number];

export const AVAILABILITIES = ["available", "busy", "away"] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export const ACTIVITY_TYPES = [
  "check_in",
  "hang_out",
  "invite",
  "date",
  "gift",
  "repair",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_STATUSES = ["active", "completed", "canceled"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const MEMORY_TYPES = [
  "first_meeting",
  "first_hangout",
  "first_date",
  "gift_received",
  "confession",
  "repair",
  "anniversary",
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

// Relationship stages. Positive stages are derived from the 7-dimension
// values, negative stages override when hostility/tension/distance are high.
export const RELATIONSHIP_STAGES = [
  "first_contact",
  "familiar",
  "trusted",
  "close_friend",
  "romantic_tension",
  "dating",
  "committed",
  "strained",
  "hostile",
  "estranged",
] as const;
export type RelationshipStage = (typeof RELATIONSHIP_STAGES)[number];

// City config. v1 ships a single fixed city; v1.x will allow user override.
export type CityConfig = {
  name: string;
  tagline: string;
  description: string;
};

// Daily state cached snapshot. `flavor_text` is populated only when the
// caller explicitly asks for it (e.g. opening companion detail).
export type CompanionDailyState = {
  companion_id: string;
  date_local: string;
  time_slot: TimeSlot;
  scene_id: string;
  mood: Mood;
  availability: Availability;
  activity_hint: string;
  flavor_text?: string | null;
};

export type RelationshipGoal = {
  description: string;
  target_dim: string;
  target_value: number;
};

export type RecommendedActivity = {
  activity_type: ActivityType;
  reason: string;
};

export type TodayRecommendation = {
  companion: {
    id: string;
    name: string;
    art_url: string | null;
    gender: string | null;
  };
  scene: {
    id: string;
    name: string;
    mood: string;
  };
  mood: Mood;
  availability: Availability;
  activity_hint: string;
  relationship_stage: RelationshipStage;
  stage_progress: number;
  next_goal: RelationshipGoal | null;
  suggested_activity: RecommendedActivity | null;
};

export type TodayResponse = {
  city: CityConfig;
  date_local: string;
  time_slot: TimeSlot;
  recommendations: TodayRecommendation[];
};

export type ActivityRecord = {
  id: string;
  user_id: string;
  companion_id: string;
  scene_id: string;
  activity_type: ActivityType;
  status: ActivityStatus;
  metadata: Record<string, unknown> | null;
  daily_state_snapshot: {
    mood: Mood;
    availability: Availability;
    activity_hint: string;
    scene_id: string;
  };
  started_at: number;
  completed_at: number | null;
  canceled_at: number | null;
};

export type MemoryRecord = {
  id: string;
  user_id: string;
  companion_id: string;
  companion: {
    art_url: string | null;
    id: string;
    name: string;
  } | null;
  memory_type: MemoryType;
  memory_subtype: string;
  scene_id: string | null;
  activity_id: string | null;
  title: string;
  summary: string;
  key_choice: string | null;
  relationship_delta: Record<string, number> | null;
  cg_template: string | null;
  cg_url: string | null;
  created_at: number;
};

export type PushTokenInput = {
  token: string;
  platform: "ios" | "android";
};
